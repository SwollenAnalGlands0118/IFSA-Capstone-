Vue.createApp({
    data() {
        return {
            stickies: [{ color: '#fcfa5d' }],
            draggedIndex: null,
            colors: ['#fcfa5d', '#6eed2a', '#f989d6', '#20dff8', '#ff9999', '#99ff99', '#9999ff', '#ffcc99'],
            currentStickiesId: null,      // Current sticky set ID from URL
            saveTimeout: null,            // For debouncing saves
            isLoading: false,             // Prevents concurrent API calls
            saveStatus: 'saved',          // 'saving', 'saved', 'error'
            lastSaved: null,              // Timestamp of last successful save
            hasUnsavedChanges: false      // Tracks pending changes    
        }
    },
    async mounted() {
        // Extract ID from URL path
        const path = window.location.pathname;
        const urlId = path.substring(1); // Remove leading slash

        // Check if it looks like a valid stickies ID (8 alphanumeric chars)
        if (/^[0-9a-fA-F]{24}$/.test(urlId)) {
            console.log('Found stickies ID in URL:', urlId);
            this.currentStickiesId = urlId;
            await this.loadFromServer();
        } else {
            console.log('No valid stickies ID in URL, starting with empty stickies');
            // Start with a single empty sticky note
            this.stickies = [{ text: '', color: '#fcfa5d', id: Date.now() }];
        }

        // Set up beforeunload handler to warn about unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges && this.saveStatus === 'saving') {
                e.preventDefault();
                return 'You have unsaved changes. Are you sure you want to leave?';
            }
        }); 
    },
    methods: {
        addStickie() {
            this.stickies.push({
                text: '',
                color: this.colors[Math.floor(Math.random() * this.colors.length)],
                id: Date.now() // Add unique ID for better tracking
            });

            // Focus the newly created textarea
            this.$nextTick(() => {
                const textareas = this.$refs.textarea;
                if (textareas && textareas.length > 0) {
                    const lastTextarea = textareas[textareas.length - 1];
                    lastTextarea.focus();
                }
            });
        },

        onTabKey(event, index) {
            // If we're on the last textarea, create a new one
            if (index === this.stickies.length - 1) {
                event.preventDefault();
                this.addStickie();
            } else {
                // Otherwise, move focus to the next textarea
                event.preventDefault();
                this.$nextTick(() => {
                    const textareas = this.$refs.textarea;
                    if (textareas && textareas[index + 1]) {
                        textareas[index + 1].focus();
                    }
                });
            }
        },

        deleteStickie(index) {
            if (this.stickies[index].text.trim() === '') {
                const wasLastStickie = index === this.stickies.length - 1;
                this.stickies.splice(index, 1);

                // Check if we deleted the last sticky
                if (this.stickies.length === 0) {
                    console.log('All stickies deleted, triggering DELETE request');
                    // The server will delete the sticky set using DELETE /api/:id
                    // This will trigger debouncedSave which will handle the server deletion
                    return; // Don't focus since we'll be refreshing
                }

                // Focus management for remaining stickies...
                if (wasLastStickie && this.stickies.length > 0) {
                    this.$nextTick(() => {
                        const textareas = this.$refs.textarea;
                        if (textareas && textareas.length > 0) {
                            const lastTextarea = textareas[textareas.length - 1];
                            lastTextarea.focus();
                            const textLength = lastTextarea.value.length;
                            lastTextarea.setSelectionRange(textLength, textLength);
                        }
                    });
                }
            }
        },

        changeColor(index) {
            const currentColor = this.stickies[index].color;
            const currentIndex = this.colors.indexOf(currentColor);
            const newColorIndex = (currentIndex + 1) % this.colors.length;
            this.stickies[index].color = this.colors[newColorIndex];
        },

        // Drag and drop methods
        onDragStart(event, index) {
            this.draggedIndex = index;
            event.dataTransfer.effectAllowed = 'move';
            event.target.classList.add('dragging');
        },

        onDragEnd(event) {
            event.target.classList.remove('dragging');
            this.draggedIndex = null;
        },

        onDragOver(event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        },

        onDrop(event, targetIndex) {
            event.preventDefault();

            if (this.draggedIndex !== null && this.draggedIndex !== targetIndex) {
                // Remove the dragged item
                const draggedItem = this.stickies.splice(this.draggedIndex, 1)[0];

                // Insert it at the target position
                this.stickies.splice(targetIndex, 0, draggedItem);
            }
        },

        onDragEnter(event) {
            event.preventDefault();
        },

        async loadFromServer() {
            if (!this.currentStickiesId) {
                console.log('No stickies ID available');
                return;
            }

            this.isLoading = true;
            try {
                const response = await fetch(`/api/${this.currentStickiesId}`);

                if (response.ok) {
                    const data = await response.json();
                    this.stickies = data.stickies;
                    this.saveStatus = 'saved';
                    this.hasUnsavedChanges = false;
                    console.log('Data loaded from server');
                } else if (response.status === 404) {
                    console.log('Stickies not found on server');
                    // Start with empty stickies for 404
                    this.stickies = [{ text: '', color: '#fcfa5d', id: Date.now() }];
                    this.saveStatus = 'saved';
                } else {
                    throw new Error(`Server error: ${response.status}`);
                }
            } catch (error) {
                console.error('Failed to load from server:', error);
                this.saveStatus = 'error';
                // Start with empty stickies on error
                this.stickies = [{ text: '', color: '#fcfa5d', id: Date.now() }];
            } finally {
                this.isLoading = false;
            }
        },

        async saveToServer() {
            if (this.isLoading || !this.currentStickiesId) return;

            this.isLoading = true;
            try {
                // Use DELETE route if stickies array is empty
                if (this.stickies.length === 0) {
                    const response = await fetch(`/api/${this.currentStickiesId}`, {
                        method: 'DELETE'
                    });

                    if (response.ok) {
                        console.log('Sticky set deleted on server, refreshing to new state');
                        this.refreshToNewStickySet();
                        return;
                    } else {
                        throw new Error(`Delete failed: ${response.status}`);
                    }
                } else {
                    // Use PUT route for updating existing stickies
                    const response = await fetch(`/api/${this.currentStickiesId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(this.stickies)
                    });

                    if (response.ok) {
                        this.saveStatus = 'saved';
                        this.lastSaved = new Date();
                        this.hasUnsavedChanges = false;
                        console.log('Data saved to server');
                    } else {
                        throw new Error(`Save failed: ${response.status}`);
                    }
                }
            } catch (error) {
                console.error('Failed to save to server:', error);
                this.saveStatus = 'error';
            } finally {
                this.isLoading = false;
            }
        },

        debouncedSave() {
            this.saveStatus = 'saving';
            this.hasUnsavedChanges = true;

            // Clear existing timeout
            clearTimeout(this.saveTimeout);

            // Set new timeout
            this.saveTimeout = setTimeout(() => {
                if (this.currentStickiesId) {
                    this.saveToServer();
                } else {
                    this.createNewStickiesOnServer();
                }
            }, 1000); // Save 1 second after user stops making changes
        },

        async createNewStickiesOnServer() {
            if (this.isLoading) return;

            // Don't create if stickies is empty or only has empty notes
            const hasContent = this.stickies.some(sticky => sticky.text && sticky.text.trim() !== '');
            if (!hasContent) {
                this.saveStatus = 'saved';
                return;
            }

            this.isLoading = true;
            try {
                const response = await fetch('/api/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.stickies)
                });

                if (response.ok) {
                    const data = await response.json();
                    this.currentStickiesId = data.id;
                    this.saveStatus = 'saved';
                    this.lastSaved = new Date();
                    this.hasUnsavedChanges = false;

                    // Update URL without page reload
                    window.history.pushState({}, '', `/${data.id}`);

                    console.log('New stickies created on server with ID:', data.id);
                } else {
                    throw new Error(`Create failed: ${response.status}`);
                }
            } catch (error) {
                console.error('Failed to create stickies on server:', error);
                this.saveStatus = 'error';
            } finally {
                this.isLoading = false;
            }
        },

        refreshToNewStickySet() {
            // Reset to fresh state with new sticky
            this.stickies = [{ text: '', color: '#fcfa5d', id: Date.now() }];
            this.currentStickiesId = null;
            this.saveStatus = 'saved';
            this.hasUnsavedChanges = false;
            this.lastSaved = null;

            // Update URL to remove ID
            window.history.pushState({}, '', '/');

            // Focus the new sticky
            this.$nextTick(() => {
                const textareas = this.$refs.textarea;
                if (textareas && textareas.length > 0) {
                    textareas[0].focus();
                }
            });

            console.log('Refreshed to new sticky set');
        }


    },
    watch: {
        stickies: {
            handler() {
                this.debouncedSave();
            },
            deep: true
        }
    }
}).mount('#app');
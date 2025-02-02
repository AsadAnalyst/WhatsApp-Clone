const DEFAULT_PASSWORD = "123";
let isLoggedIn = false;

const socket = io();
let localConnection;
let remoteConnection;
let dataChannel;
let receiveChannel;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let peerPublicKey = null;
let privateKey = null;
let myKeyPair = null;
let connectedUsers = new Map(); // Store all connected users

// ` UI Elements
const messageInput = document.getElementById("messageInput");
const messageArea = document.querySelector(".message__area");
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.style.display = "none";
document.body.appendChild(fileInput);
const sendButton = document.querySelector(".send-btn");

// Add this at the top of client.js
window.windowId = Math.random().toString(36).substring(2);

function checkExistingSession() {
    try {
        const currentSession = localStorage.getItem('activeSession');
        if (currentSession) {
            const sessionData = JSON.parse(currentSession);
            const now = new Date().getTime();
            
            // Check if session is still valid (24 hours) and belongs to this window
            if (now - sessionData.timestamp < 24 * 60 * 60 * 1000 && 
                sessionData.windowId === window.windowId) {
                return sessionData.username;
            } else {
                localStorage.removeItem('activeSession');
            }
        }
    } catch (error) {
        console.error('Error checking session:', error);
        localStorage.removeItem('activeSession');
    }
    return null;
}

// Add login handling function
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorElement = document.getElementById('loginError');
    
    try {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        
        if (data.success) {
            // Set active session with window ID
            localStorage.setItem('activeSession', JSON.stringify({
                username: username,
                timestamp: new Date().getTime(),
                windowId: window.windowId
            }));
            
            document.getElementById('loginOverlay').style.display = 'none';
            localStorage.setItem('username', username);
            
            // Initialize chat components
            setupConnection();
            updateActiveUsers();
            updateSendButtonState();
            
            // Update welcome message
            document.querySelector('.chat-header-info h1').textContent = `Welcome, ${username}!`;
        } else {
            errorElement.textContent = data.error || "Invalid credentials";
            errorElement.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorElement.textContent = "Error logging in. Please try again.";
        errorElement.style.display = 'block';
    }
    return false;
}

async function handleSignup(event) {
    event.preventDefault();
    
    const username = document.getElementById('signupUsername').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorElement = document.getElementById('signupError');
    
    if (password !== confirmPassword) {
        errorElement.textContent = "Passwords do not match";
        errorElement.style.display = 'block';
        return false;
    }
    
    try {
        console.log('Attempting signup with:', { username, password }); // Debug log
        
        const response = await fetch('/auth/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        console.log('Signup response:', data); // Debug log
        
        if (data.success) {
            // Switch to login form
            document.getElementById('signupForm').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
            document.getElementById('loginUsername').value = username;
            // Update switch buttons
            document.querySelector('[data-form="login"]').classList.add('active');
            document.querySelector('[data-form="signup"]').classList.remove('active');
            // Clear error message
            errorElement.style.display = 'none';
        } else {
            errorElement.textContent = data.error || "Error creating account";
            errorElement.style.display = 'block';
        }
    } catch (error) {
        console.error('Signup error:', error);
        errorElement.textContent = "Error creating account. Please try again.";
        errorElement.style.display = 'block';
    }
    return false;
}

// Add form switch functionality
document.addEventListener('DOMContentLoaded', () => {
    const switchButtons = document.querySelectorAll('.switch-btn');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    switchButtons.forEach(button => {
        button.addEventListener('click', () => {
            const formType = button.getAttribute('data-form');
            
            // Update active states
            switchButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Show/hide forms
            if (formType === 'login') {
                loginForm.classList.remove('hidden');
                signupForm.classList.add('hidden');
            } else {
                loginForm.classList.add('hidden');
                signupForm.classList.remove('hidden');
            }
            
            // Clear error messages
            document.getElementById('loginError').style.display = 'none';
            document.getElementById('signupError').style.display = 'none';
        });
    });
});

// Add this check when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const activeUser = checkExistingSession();
    const loginOverlay = document.getElementById('loginOverlay');
    
    if (activeUser && window.windowId === JSON.parse(localStorage.getItem('activeSession')).windowId) {
        // User is already logged in this window
        loginOverlay.style.display = 'none';
        localStorage.setItem('username', activeUser);
        setupConnection();
        updateActiveUsers();
        updateSendButtonState();
        document.querySelector('.chat-header-info h1').textContent = `Welcome, ${activeUser}!`;
    } else {
        loginOverlay.style.display = 'flex';
    }
});

// Initialize WebRTC connection
function setupConnection() {
    localConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    dataChannel = localConnection.createDataChannel("chat");
    setupDataChannel(dataChannel);

    localConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("signal", { candidate: event.candidate });
        }
    };

    createOffer();
}

// Set up DataChannel events
function setupDataChannel(channel) {
    channel.onopen = async () => {
        console.log("Data channel is open");
        await initializeEncryption();
        
        // Send username to peer
        const username = localStorage.getItem('username');
        if (username) {
            channel.send(JSON.stringify({
                type: 'username',
                username: username,
                id: window.windowId // Include window ID to identify unique users
            }));
        }
        
        updateActiveUsers();
        updateSendButtonState();
    };

    channel.onclose = () => {
        console.log("Data channel is closed");
        // Remove disconnected peer
        connectedUsers.delete('peer');
        peerPublicKey = null;
        updateActiveUsers();
        updateSendButtonState();
    };

    channel.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'username') {
                // Store peer's username with their window ID
                connectedUsers.set('peer', {
                    username: data.username,
                    status: 'Connected',
                    id: data.id
                });
                localStorage.setItem('peerUsername', data.username);
                updateActiveUsers();
                return;
            }
            
            if (data.type === 'public_key') {
                // Handle received public key
                peerPublicKey = await Encryption.importPublicKey(data.key);
                console.log('Received peer public key');
                // Send our public key in response
                if (!data.isResponse) {
                    sendPublicKey();
                }
                return;
            }
            
            if (data.type === 'encrypted' && myKeyPair?.privateKey) {
                try {
                    socket.emit('encrypted_message', data.data);
                    
                    const decryptedMessage = await Encryption.decryptMessage(data.data, myKeyPair.privateKey);
                    
                    socket.emit('decrypted_message', {
                        message: decryptedMessage,
                        timestamp: new Date().toISOString()
                    });
                    
                    displayMessage("Peer", decryptedMessage);
                } catch (error) {
                    console.error("Error decrypting message:", error);
                }
            } else if (data.type === "file") {
                handleFileMessage(data.file);
            } else if (data.type === "voice") {
                handleVoiceMessage(data.audio);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    };
}

// Create an offer
function createOffer() {
    localConnection
        .createOffer()
        .then((offer) => {
            localConnection.setLocalDescription(offer);
            socket.emit("signal", { offer });
        })
        .catch((error) => console.error("Error creating offer:", error));
}

// Handle incoming signaling data
socket.on("signal", async (data) => {
    if (data.offer) {
        remoteConnection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        remoteConnection.ondatachannel = (event) => {
            receiveChannel = event.channel;
            setupDataChannel(receiveChannel);
            updateActiveUsers();
        };

        remoteConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("signal", { candidate: event.candidate });
            }
        };

        await remoteConnection.setRemoteDescription(data.offer);
        const answer = await remoteConnection.createAnswer();
        await remoteConnection.setLocalDescription(answer);
        socket.emit("signal", { answer });
    } else if (data.answer) {
        await localConnection.setRemoteDescription(data.answer);
    } else if (data.candidate) {
        const connection = remoteConnection || localConnection;
        if (connection) {
            await connection.addIceCandidate(data.candidate);
        }
    }
});

// Send Message Function
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    sendButton.disabled = true;

    try {
        if (peerPublicKey && myKeyPair) {
            const encryptedData = await Encryption.encryptMessage(message, peerPublicKey);
            const messageData = {
                type: 'encrypted',
                data: encryptedData
            };

            socket.emit('encrypted_message', encryptedData);
            socket.emit('decrypted_message', {
                message: message,
                timestamp: new Date().toISOString()
            });

            const channel = dataChannel?.readyState === "open" ? dataChannel : receiveChannel;
            if (channel?.readyState === "open") {
                channel.send(JSON.stringify(messageData));
                displayMessage("You", message);
                messageInput.value = "";
            } else {
                throw new Error("No open channels to send message");
            }
        } else {
            throw new Error("Encryption not initialized or peer public key not received");
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert("Error sending message. Please try again.");
    } finally {
        sendButton.disabled = false;
        updateSendButtonState();
    }
}

// Display messages
function displayMessage(sender, message) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender === 'You' ? 'outgoing' : 'incoming'}`;
    
    const timestamp = document.createElement("span");
    timestamp.className = "message-timestamp";
    timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const senderName = document.createElement("h4");
    senderName.textContent = sender === 'You' ? localStorage.getItem('username') : sender;
    messageDiv.appendChild(senderName);
    messageDiv.appendChild(timestamp);
    
    if (typeof message === 'string') {
        if (message.includes('<audio') || message.includes('<a')) {
            messageDiv.innerHTML += message;
        } else {
            const messageContent = document.createElement("p");
            messageContent.textContent = message;
            messageDiv.appendChild(messageContent);
        }
    }
    
    messageArea.appendChild(messageDiv);
    messageArea.scrollTop = messageArea.scrollHeight;
}

// Setup initial connection
setupConnection();

// Add this function
function updateSendButtonState() {
    const message = messageInput.value.trim();
    const isConnected = dataChannel?.readyState === "open" || receiveChannel?.readyState === "open";
    
    // Disable button if no message or no connection
    sendButton.disabled = !message || !isConnected;
    sendButton.style.opacity = (message && isConnected) ? '1' : '0.5';
}

// Add these event listeners at the bottom of the file
messageInput.addEventListener('input', updateSendButtonState);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !sendButton.disabled) {
        e.preventDefault();
        sendMessage();
    }
});

// Add click event listener to send button
sendButton.addEventListener('click', () => {
    if (!sendButton.disabled) {
        sendMessage();
    }
});

// Add these functions for file handling
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = () => {
            const fileData = {
                name: file.name,
                type: file.type,
                size: file.size,
                content: reader.result
            };

            const channel = dataChannel?.readyState === "open" ? dataChannel : receiveChannel;
            if (channel) {
                channel.send(JSON.stringify({ 
                    type: "file", 
                    file: fileData 
                }));
                displayMessage("You", `Sent a file: ${file.name}`);
            }
        };
        reader.readAsArrayBuffer(file);
    }
}

function handleFileMessage(file) {
    const blob = new Blob([file.content], { type: file.type });
    const url = URL.createObjectURL(blob);
    displayMessage("Peer", `Received a file: <a href="${url}" download="${file.name}">${file.name}</a>`);
}

// Add these functions for voice recording
function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus',
                audioBitsPerSecond: 128000
            });
            
            audioChunks = [];
            mediaRecorder.addEventListener("dataavailable", (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            });

            mediaRecorder.addEventListener("stop", async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
                const arrayBuffer = await audioBlob.arrayBuffer();
                const base64Data = btoa(
                    new Uint8Array(arrayBuffer)
                        .reduce((data, byte) => data + String.fromCharCode(byte), '')
                );

                const channel = dataChannel?.readyState === "open" ? dataChannel : receiveChannel;
                if (channel) {
                    channel.send(JSON.stringify({ 
                        type: "voice", 
                        audio: base64Data 
                    }));
                    
                    const audioUrl = URL.createObjectURL(audioBlob);
                    displayMessage("You", `Sent a voice message: <audio controls src="${audioUrl}"></audio>`);
                }

                stream.getTracks().forEach(track => track.stop());
            });

            mediaRecorder.start(100);
            isRecording = true;
            const voiceButton = document.getElementById('voiceButton');
            voiceButton.innerHTML = '<i class="fas fa-stop"></i>';
            voiceButton.classList.add('recording');
        })
        .catch(error => {
            console.error("Error accessing microphone:", error);
            alert("Error accessing microphone. Please ensure microphone permissions are granted.");
        });
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        isRecording = false;
        const voiceButton = document.getElementById('voiceButton');
        voiceButton.innerHTML = '<i class="fas fa-microphone"></i>';
        voiceButton.classList.remove('recording');
    }
}

function handleVoiceMessage(audio) {
    try {
        const binaryString = atob(audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const audioBlob = new Blob([bytes], { type: 'audio/webm;codecs=opus' });
        const url = URL.createObjectURL(audioBlob);
        displayMessage("Peer", `Received a voice message: <audio controls src="${url}"></audio>`);
    } catch (error) {
        console.error("Error handling voice message:", error);
        displayMessage("Peer", "Error playing voice message");
    }
}

// Add event listeners at the bottom of the file
document.getElementById('attachButton').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';
    input.onchange = handleFileSelect;
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
});

document.getElementById('voiceButton').addEventListener('click', toggleRecording);

// Add emoji picker functionality
document.querySelector('.emoji-btn').addEventListener('click', () => {
    const picker = document.querySelector('.emoji-picker-container');
    picker.classList.toggle('active');
});

document.querySelector('emoji-picker')?.addEventListener('emoji-click', event => {
    const emoji = event.detail.unicode;
    const cursorPosition = messageInput.selectionStart;
    const textBeforeCursor = messageInput.value.substring(0, cursorPosition);
    const textAfterCursor = messageInput.value.substring(cursorPosition);
    
    messageInput.value = textBeforeCursor + emoji + textAfterCursor;
    messageInput.selectionStart = cursorPosition + emoji.length;
    messageInput.selectionEnd = cursorPosition + emoji.length;
    messageInput.focus();
    
    document.querySelector('.emoji-picker-container').classList.remove('active');
    updateSendButtonState();
});

// Function to update active users in sidebar
function updateActiveUsers() {
    const activeUsersDiv = document.querySelector('.active-users');
    activeUsersDiv.innerHTML = '';

    // Add current user
    const currentUsername = localStorage.getItem('username');
    if (currentUsername) {
        connectedUsers.set('self', {
            username: currentUsername,
            status: 'Online'
        });
    }

    // Add all connected users to the sidebar
    connectedUsers.forEach((user, id) => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user-item';
        userDiv.innerHTML = `
            <div class="user-avatar">${user.username.charAt(0).toUpperCase()}</div>
            <div class="user-info">
                <p class="user-name">${user.username}</p>
                <p class="user-status">${user.status}</p>
            </div>
        `;
        activeUsersDiv.appendChild(userDiv);
    });

    updateConnectionStatus();
}

// Function to update connection status
function updateConnectionStatus() {
    const statusDiv = document.querySelector('.connection-info');
    const isConnected = dataChannel?.readyState === 'open' || receiveChannel?.readyState === 'open';
    
    statusDiv.innerHTML = `
        <span class="status-indicator ${isConnected ? 'status-connected' : 'status-disconnected'}"></span>
        ${isConnected ? 'Connected' : 'Waiting for connection...'}
    `;

    // Update send button state when connection status changes
    updateSendButtonState();
}

// Add these event listeners
dataChannel?.addEventListener('open', updateActiveUsers);
dataChannel?.addEventListener('close', updateActiveUsers);
receiveChannel?.addEventListener('open', updateActiveUsers);
receiveChannel?.addEventListener('close', updateActiveUsers);

// Call initially
updateActiveUsers();
updateSendButtonState();

// Add this function to initialize encryption
async function initializeEncryption() {
    try {
        myKeyPair = await Encryption.generateKeyPair();
        console.log('Encryption initialized');
        // Send public key when encryption is initialized
        if (dataChannel?.readyState === "open" || receiveChannel?.readyState === "open") {
            sendPublicKey();
        }
    } catch (error) {
        console.error('Error initializing encryption:', error);
    }
}

// Add function to send public key
async function sendPublicKey() {
    try {
        const publicKeyStr = await Encryption.exportPublicKey(myKeyPair.publicKey);
        const channel = dataChannel?.readyState === "open" ? dataChannel : receiveChannel;
        if (channel) {
            channel.send(JSON.stringify({
                type: 'public_key',
                key: publicKeyStr
            }));
        }
    } catch (error) {
        console.error('Error sending public key:', error);
    }
}



        
const fs = require('fs');
const path = require('path');

// Create the server directory if it doesn't exist
const SERVER_DIR = path.join(__dirname);
if (!fs.existsSync(SERVER_DIR)) {
    fs.mkdirSync(SERVER_DIR, { recursive: true });
}

const USERS_FILE = path.join(SERVER_DIR, 'users.json');

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = {
        "admin": "123"
    };
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
        console.log('Created users file with default user at:', USERS_FILE);
    } catch (error) {
        console.error('Error creating users file:', error);
    }
}

function readUsers() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            return { "admin": "123" };
        }
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data) || { "admin": "123" };
    } catch (error) {
        console.error('Error reading users file:', error);
        return { "admin": "123" };
    }
}

function writeUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        console.log('Users file updated successfully');
    } catch (error) {
        console.error('Error writing users file:', error);
        throw new Error('Failed to save user data');
    }
}

function addUser(username, password) {
    console.log('Adding user:', username); // Debug log
    
    if (!username || !password) {
        throw new Error('Username and password are required');
    }
    
    const users = readUsers();
    console.log('Current users:', users); // Debug log
    
    if (users[username]) {
        throw new Error('Username already exists');
    }
    
    users[username] = password;
    writeUsers(users);
    console.log('User added successfully'); // Debug log
}

function verifyUser(username, password) {
    console.log('Verifying user:', username); // Debug log
    
    if (!username || !password) {
        return false;
    }
    
    const users = readUsers();
    console.log('Current users:', users); // Debug log
    
    const isValid = users[username] === password;
    console.log('Login valid:', isValid); // Debug log
    
    return isValid;
}

module.exports = {
    addUser,
    verifyUser
}; 
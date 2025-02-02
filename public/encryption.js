class Encryption {
    static async generateKeyPair() {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true,
            ["encrypt", "decrypt"]
        );
        return keyPair;
    }

    static async exportPublicKey(publicKey) {
        const exported = await window.crypto.subtle.exportKey(
            "spki",
            publicKey
        );
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    }

    static async importPublicKey(publicKeyStr) {
        const binaryString = atob(publicKeyStr);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return await window.crypto.subtle.importKey(
            "spki",
            bytes,
            {
                name: "RSA-OAEP",
                hash: "SHA-256",
            },
            true,
            ["encrypt"]
        );
    }

    static async encryptMessage(message, publicKey) {
        // Generate AES key for message encryption
        const aesKey = await window.crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256,
            },
            true,
            ["encrypt", "decrypt"]
        );

        // Encrypt message with AES
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedMessage = new TextEncoder().encode(message);
        const encryptedMessage = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            aesKey,
            encodedMessage
        );

        // Encrypt AES key with RSA
        const exportedAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
        const encryptedKey = await window.crypto.subtle.encrypt(
            {
                name: "RSA-OAEP"
            },
            publicKey,
            exportedAesKey
        );

        return {
            encryptedMessage: btoa(String.fromCharCode(...new Uint8Array(encryptedMessage))),
            encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encryptedKey))),
            iv: btoa(String.fromCharCode(...iv))
        };
    }

    static async decryptMessage(encryptedData, privateKey) {
        // Decrypt the AES key
        const encryptedKeyBytes = Uint8Array.from(atob(encryptedData.encryptedKey), c => c.charCodeAt(0));
        const decryptedKeyBuffer = await window.crypto.subtle.decrypt(
            {
                name: "RSA-OAEP"
            },
            privateKey,
            encryptedKeyBytes
        );

        // Import the decrypted AES key
        const aesKey = await window.crypto.subtle.importKey(
            "raw",
            decryptedKeyBuffer,
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["decrypt"]
        );

        // Decrypt the message
        const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));
        const encryptedMessageBytes = Uint8Array.from(atob(encryptedData.encryptedMessage), c => c.charCodeAt(0));
        const decryptedMessage = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            aesKey,
            encryptedMessageBytes
        );

        return new TextDecoder().decode(decryptedMessage);
    }

    static async sign(message, privateKey) {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const signature = await window.crypto.subtle.sign(
            {
                name: "RSA-PSS",
                saltLength: 32,
            },
            privateKey,
            data
        );
        return btoa(String.fromCharCode(...new Uint8Array(signature)));
    }

    static async verify(message, signature, publicKey) {
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
        return await window.crypto.subtle.verify(
            {
                name: "RSA-PSS",
                saltLength: 32,
            },
            publicKey,
            signatureBytes,
            data
        );
    }
}
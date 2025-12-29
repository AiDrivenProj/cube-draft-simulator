
import { NetworkMessage } from '../types';
import { database, auth } from './firebaseConfig';
import { ref, push, onChildAdded, off, set, remove, get } from 'firebase/database';
import { signInAnonymously } from 'firebase/auth';

export interface IMultiplayerService {
    connect(roomId: string, onMessage: (msg: NetworkMessage) => void): Promise<void>;
    send(msg: NetworkMessage): void;
    disconnect(): void;
    mode: 'local' | 'online';
}

/**
 * Local implementation using BroadcastChannel.
 * Works only within the same browser context (tabs/windows).
 */
export class LocalMultiplayerService implements IMultiplayerService {
    private channel: BroadcastChannel | null = null;
    public mode: 'local' | 'online' = 'local';

    async connect(roomId: string, onMessage: (msg: NetworkMessage) => void): Promise<void> {
        this.disconnect();
        this.channel = new BroadcastChannel(`draft_room_${roomId}`);
        this.channel.onmessage = (event) => onMessage(event.data);
    }

    send(msg: NetworkMessage): void {
        this.channel?.postMessage(msg);
    }

    disconnect(): void {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
    }
}

/**
 * Online implementation using Firebase Realtime Database.
 * Uses a "Message Bus" pattern: clients push messages to a list, everyone listens to additions.
 */
export class FirebaseMultiplayerService implements IMultiplayerService {
    private roomId: string | null = null;
    private onMessageCallback: ((msg: NetworkMessage) => void) | null = null;
    private messagesRef: any = null;
    public mode: 'local' | 'online' = 'online';

    async connect(roomId: string, onMessage: (msg: NetworkMessage) => void): Promise<void> {
        if (!database || !auth) {
            // User hasn't configured Firebase yet.
            // Avoid throwing a hard error to the console which might look like a crash.
            console.warn("Firebase not initialized. Online Multiplayer requires valid API keys in services/firebaseConfig.ts");
            return;
        }
        
        this.disconnect(); // Cleanup previous

        // Authenticate anonymously before attaching listeners
        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Firebase Auth Error:", error);
            // We return early because without auth, DB reads/writes will likely fail
            // depending on security rules.
            return;
        }

        this.roomId = roomId;
        this.onMessageCallback = onMessage;
        this.messagesRef = ref(database, `rooms/${roomId}/messages`);

        // Listener for new messages
        onChildAdded(this.messagesRef, (snapshot) => {
            const data = snapshot.val();
            if (data && this.onMessageCallback) {
                this.onMessageCallback(data);
            }
        });
    }

    send(msg: NetworkMessage): void {
        if (!this.roomId || !this.messagesRef) {
            // Silently ignore if not connected to DB (prevents crashes in partially configured state)
            return;
        }
        
        // Sanitize message: Firebase doesn't like 'undefined', convert to null or stringify/parse
        const cleanMsg = JSON.parse(JSON.stringify(msg));
        
        // Push creates a new child with a unique key (like an append-only log)
        push(this.messagesRef, cleanMsg).catch(err => {
            // Only log if it's not a permission/config issue we expect
            if (err?.code !== 'PERMISSION_DENIED') {
                 console.error("Firebase send error:", err);
            }
        });
    }

    disconnect(): void {
        if (this.messagesRef) {
            off(this.messagesRef); // Stop listening
            this.messagesRef = null;
        }
        this.roomId = null;
        this.onMessageCallback = null;
    }
}

export const MultiplayerFactory = {
    getService: (mode: 'local' | 'online'): IMultiplayerService => {
        return mode === 'online' ? new FirebaseMultiplayerService() : new LocalMultiplayerService();
    }
};


# 🎲 MTG CubeDraft Simulator

![React](https://img.shields.io/badge/React-19-blue?logo=react&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.0-38b2ac?logo=tailwind-css&style=flat-square)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

A modern, responsive, and lightweight web application for simulating Magic: The Gathering Cube Drafts. Designed for a seamless experience on both desktop and mobile devices, featuring drag-and-drop mechanics, real-time local multiplayer, and robust deck-building tools.

---

## ✨ Key Features

### 🚀 Setup & Import
*   **CubeCobra Integration**: Import any public cube directly using its Cube ID.
*   **Manual Entry**: Paste your own custom card list (.txt format support).
*   **Deck Import**: Re-import previously drafted decks to view or edit them via the dedicated **Deck Viewer** mode.
*   **History**: Remembers your recently used cubes for quick access.

### 🎮 Drafting Experience
*   **Immersive UI**: Touch-optimized Drag-and-Drop interface.
*   **Smart Timer**: Dynamic pick timer that scales down as the pack gets smaller.
*   **Bot Support**: Fill empty seats with AI bots to practice drafting.
*   **Auto-Pick**: Optional "Autopick" feature for AFK moments.
*   **Local Multiplayer**: Uses `BroadcastChannel` API to simulate multiplayer across different tabs/windows in the same browser.

### 🛠️ Deck Building (Recap View)
*   **Matrix View**: Analyze your pool by Color, CMC, or Card Type.
*   **Smart Filtering**: Automatically hides empty colors or types to keep the view clean.
*   **Sideboard Management**: Drag-and-drop cards between Mainboard and Sideboard.
*   **Basic Lands**: Built-in Basic Land picker with counter.
*   **Export Options**:
    *   **Detailed**: Full list with `// MAINBOARD` and `// SIDEBOARD` headers (Cockatrice compatible).
    *   **Simple**: Standard list format (Arena/MTGO compatible).

### ⚡ Technical Highlights
*   **Image Caching**: Uses `IndexedDB` to cache card images locally, reducing bandwidth and speeding up subsequent loads.
*   **Metadata Enrichment**: Fetches Card types, colors, and CMC via Scryfall API if missing from the source.
*   **No Backend Required**: Runs entirely client-side (using `BroadcastChannel` for "networking").

---

## ⚠️ Important Note on Multiplayer

This application uses the **BroadcastChannel API** for communication.
*   **How it works**: Multiplayer works between **tabs or windows within the same browser** on the same device.
*   **Remote Play**: To play with friends over the internet, you would typically need to screen-share or be physically present. This is designed primarily as a local simulator or a "Hot-seat" tool.

---

## 📦 Installation & Running

This project uses a standard React structure.

1.  **Clone the repository**
    ```bash
    git clone https://github.com/your-username/cubedraft-sim.git
    cd cubedraft-sim
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Run Development Server**
    ```bash
    npm start
    # or
    npm run dev
    ```

4.  **Build for Production**
    ```bash
    npm run build
    ```

---

## 📖 How to Use

### 1. Choose Mode
At the start screen, select between two main modes:
*   **Start Draft**: To create a new draft lobby with friends or bots.
*   **Deck Viewer**: To manage, view, or edit a saved deck file.

### 2. Setup Phase (Draft Mode)
*   Choose **CubeCobra** and enter an ID (e.g., `vintage`, `pauper_cube`).
*   Or choose **Manual List** and upload a `.txt` file containing card names.
*   Click **Create Draft Room**.

### 3. Lobby
*   You will be assigned as the **Host**.
*   Open new tabs with the provided **Invite Link** to add more human players (simulated).
*   Click **+ Add Bot** to fill remaining slots.
*   Adjust the **Pick Timer** slider if desired.
*   Click **Start Draft**.

### 4. Drafting
*   **Drag** a card to the bottom zone to pick it.
*   **Tap and Hold** (Mobile) or **Click** (Desktop) to preview a card.
*   Keep an eye on the timer bar at the top!

### 5. Deck Construction
*   Sort your pool using the buttons at the top (Pool, Color, Type).
*   Drag unneeded cards to the bottom **Sideboard** bar.
*   Add basic lands using the **+ Basic Lands** button.
*   Click **Export .txt** to save your deck to your device.

---

## 📂 Project Structure

*   `components/`: React UI components (DraftView, RecapView, LobbyScreen, etc.).
*   `services/`: Logic for APIs (Scryfall, CubeCobra), Networking, and Image Caching.
*   `hooks/`: Custom React hooks for game state management (`useDraftGame`).
*   `types.ts`: TypeScript interfaces for the application state.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the project
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

Built with ❤️ for the MTG Community.

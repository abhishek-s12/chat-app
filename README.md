# 💬 Real-Time Unified Simple Chat Application

A complete, feature-rich real-time messaging application featuring a cross-platform **React Native (Expo)** client and a robust **Node.js / Express / Socket.io / MongoDB** backend.

---

## ✨ Premium Features

- **⚡ Real-Time Messaging**: Built on Socket.io for instantaneous message delivery and server-client updates.
- **👥 Direct & Group Chats**: Create multiple conversation rooms with friends or set up large group chats.
- **☁️ Permanent Cloud Image Sharing**: Direct image uploads using Multer memory streaming to **Cloudinary's global CDN**.
- **💬 Message Threading (Replies)**: Select and reply to specific messages in a conversation with visual nested thread blocks.
- **❤️ Emoji Reactions**: Long-press any message to toggle emoji reactions (👍, ❤️, 😂, 😮, 😢, 😡) in real time.
- **👁️ Read & Delivery Receipts**: Track message states via checkmarks:
  - Single gray check (`✓`) for sent messages.
  - Double gray checks (`✓✓`) for delivered.
  - Double blue checks (`✓✓`) for read status.
- **✍️ Animated Typing Indicators**: Displays a smooth, staggered bouncing dots typing row when other users are active.
- **⚙️ User Settings**: A profile management screen to update credentials and set custom avatars.

---

## 🏗️ Repository Structure

This repository is split into two self-contained directories:
```
chat-app/
├── server/       # Node.js/Express backend & Socket.io server
└── mobile/       # React Native (Expo) frontend application
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v16+)
- **MongoDB** (Local instance or MongoDB Atlas cloud URI)
- **Cloudinary Account** (For image and avatar hosting)

---

### 2. Backend Setup (`/server`)

1. Navigate to the server folder:
   ```bash
   cd server
   ```
2. Install server dependencies:
   ```bash
   npm install
   ```
3. Configure your Environment Variables:
   Create a `.env` file in the `server/` directory and configure the variables (use `.env.example` as a template):
   ```env
   PORT=5000
   MONGO_URI=your_mongodb_connection_uri
   JWT_SECRET=your_jwt_signing_secret
   CLIENT_URL=http://localhost:8081

   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   ```
4. Start the backend development server:
   ```bash
   npm run dev
   ```

---

### 3. Frontend Setup (`/mobile`)

1. Navigate to the mobile folder:
   ```bash
   cd mobile
   ```
2. Install client dependencies:
   ```bash
   npm install
   ```
3. Configure API base URL:
   Check `mobile/src/api/axiosClient.js` to ensure the Axios client points to your backend instance (e.g. `http://localhost:5000/api` or your local machine IP).
4. Run the Expo Metro Bundler:
   ```bash
   npx expo start
   ```
5. Press:
   - `w` to open the application in your browser.
   - Scan the QR code using the **Expo Go** application on your physical Android/iOS phone.

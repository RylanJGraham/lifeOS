"use client";

import { Suspense } from "react";
import ChatPanel from "./components/ChatPanel";

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPanel />
    </Suspense>
  );
}

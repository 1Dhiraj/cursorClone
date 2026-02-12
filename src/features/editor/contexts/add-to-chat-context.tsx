"use client";

import { createContext, useContext, useRef, ReactNode } from "react";

interface AddToChatContextType {
    registerHandler: (handler: (text: string) => void) => void;
    addToChat: (text: string) => void;
}

const AddToChatContext = createContext<AddToChatContextType | null>(null);

export const AddToChatProvider = ({ children }: { children: ReactNode }) => {
    const handlerRef = useRef<((text: string) => void) | null>(null);

    const registerHandler = (handler: (text: string) => void) => {
        handlerRef.current = handler;
    };

    const addToChat = (text: string) => {
        if (handlerRef.current) {
            handlerRef.current(text);
        }
    };

    return (
        <AddToChatContext.Provider value={{ registerHandler, addToChat }}>
            {children}
        </AddToChatContext.Provider>
    );
};

export const useAddToChat = () => {
    const context = useContext(AddToChatContext);
    if (!context) {
        throw new Error("useAddToChat must be used within AddToChatProvider");
    }
    return context;
};

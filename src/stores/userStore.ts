import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

interface UserState {
  userId: string;
  username: string;
  setUsername: (name: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      userId: uuidv4(),
      username: '',
      setUsername: (name: string) => set({ username: name.trim().slice(0, 20) }),
    }),
    { name: 'collab-user' }
  )
);

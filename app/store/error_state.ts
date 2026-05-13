import { create } from "zustand";

interface Error {
  error: string | null;
  success: string | null;
  actions: {
    setError: (error: string | null) => void;
    setSuccess: (success: string | null) => void;
  };
}

const useErrorStore = create<Error>((set) => ({
  error: null,
  success: null,
  actions: {
    setError: (error: string | null) => set(() => ({ error: error })),
    setSuccess: (success: string | null) => set(() => ({ success: success })),
  },
}));

// Export store instance for direct access in non-React contexts
export const errorStore = useErrorStore;

export const useError = () => useErrorStore((state) => state.error);
export const useSuccess = () => useErrorStore((state) => state.success);
export const useErrorActions = () => useErrorStore((state) => state.actions);

import { createContext } from 'react';

/** Callbacks custom nodes need; provided by Canvas so node components stay free of app state. */
export const CanvasActions = createContext<{ select: (id: string) => void; addResource: (groupId: string) => void }>({ select: () => {}, addResource: () => {} });

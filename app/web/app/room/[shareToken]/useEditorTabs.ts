"use client";

import { useCallback, useReducer } from "react";

type TabState = {
  openIds: string[];
  activeId: string | null;
};

type TabAction =
  | { type: "open"; id: string }
  | { type: "close"; id: string }
  | { type: "sync-files"; fileIds: string[] };

const initialState: TabState = {
  openIds: [],
  activeId: null,
};

function tabReducer(state: TabState, action: TabAction): TabState {
  switch (action.type) {
    case "open": {
      if (state.activeId === action.id) return state;

      return {
        openIds: state.openIds.includes(action.id)
          ? state.openIds
          : [...state.openIds, action.id],
        activeId: action.id,
      };
    }

    case "close": {
      const index = state.openIds.indexOf(action.id);

      // Keep one tab open while the room has files.
      if (index === -1 || state.openIds.length === 1) return state;

      const openIds = state.openIds.filter((id) => id !== action.id);

      // Closing the active tab selects its right neighbor, or its left
      // neighbor if it was the last tab in the row.
      const activeId =
        action.id === state.activeId
          ? openIds[Math.min(index, openIds.length - 1)]
          : state.activeId;

      return { openIds, activeId };
    }

    case "sync-files": {
      const available = new Set(action.fileIds);
      const openIds = state.openIds.filter((id) => available.has(id));

      if (openIds.length === 0) {
        const firstId = available.has("main") ? "main" : action.fileIds[0];

        return firstId
          ? { openIds: [firstId], activeId: firstId }
          : initialState;
      }

      if (state.activeId !== null && available.has(state.activeId)) {
        // Renaming, moving, or creating another file preserves our tabs.
        return openIds.length === state.openIds.length
          ? state
          : { openIds, activeId: state.activeId };
      }

      // A collaborator deleted our active file or its parent folder.
      const oldIndex = state.openIds.indexOf(state.activeId ?? "");
      const nextIndex = Math.max(0, Math.min(oldIndex, openIds.length - 1));

      return { openIds, activeId: openIds[nextIndex] };
    }
  }
}

export function useEditorTabs() {
  const [state, dispatch] = useReducer(tabReducer, initialState);

  const openFile = useCallback((id: string) => {
    dispatch({ type: "open", id });
  }, []);

  const closeTab = useCallback((id: string) => {
    dispatch({ type: "close", id });
  }, []);

  const syncTabsWithFiles = useCallback((fileIds: string[]) => {
    dispatch({ type: "sync-files", fileIds });
  }, []);

  return {
    openFileIds: state.openIds,
    activeFileId: state.activeId,
    openFile,
    closeTab,
    syncTabsWithFiles,
  };
}
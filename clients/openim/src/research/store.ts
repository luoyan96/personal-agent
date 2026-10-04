import type { ResponseFor } from "@research-agent-platform/contracts";
import { create } from "zustand";
import { researchApi } from "./api";

type State = {
  generation: number;
  refreshSequence: number;
  session?: ResponseFor<"imSession">["data"];
  actor?: ResponseFor<"session">["data"];
  contacts: ResponseFor<"imContacts">["data"]["contacts"];
  mappings: ResponseFor<"imConversations">["data"]["conversations"];
  error: string;
  setSession: (
    session: ResponseFor<"imSession">["data"],
    actor: ResponseFor<"session">["data"],
  ) => void;
  refresh: () => Promise<void>;
  clear: () => void;
};
export const useResearchStore = create<State>((set) => ({
  generation: 0,
  refreshSequence: 0,
  contacts: [],
  mappings: [],
  error: "",
  setSession: (session, actor) =>
    set((state) => ({ session, actor, error: "", generation: state.generation + 1 })),
  refresh: async () => {
    const generation = useResearchStore.getState().generation;
    const sequence = useResearchStore.getState().refreshSequence + 1;
    set({ refreshSequence: sequence });
    try {
      const [contacts, mappings, actor] = await Promise.all([
        researchApi("imContacts"),
        researchApi("imConversations"),
        researchApi("session"),
      ]);
      if (
        generation === useResearchStore.getState().generation &&
        sequence === useResearchStore.getState().refreshSequence
      )
        set({
          actor: actor.data,
          contacts: contacts.data.contacts,
          mappings: mappings.data.conversations,
          error: "",
        });
    } catch (error) {
      if (
        generation === useResearchStore.getState().generation &&
        sequence === useResearchStore.getState().refreshSequence
      )
        set({
          contacts: [],
          mappings: [],
          error: error instanceof Error ? error.message : "科研资料读取失败",
        });
      throw error;
    }
  },
  clear: () =>
    set((state) => ({
      generation: state.generation + 1,
      session: undefined,
      actor: undefined,
      contacts: [],
      mappings: [],
      error: "",
    })),
}));

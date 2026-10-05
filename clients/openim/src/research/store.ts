import type { ResponseFor } from "@research-agent-platform/contracts";
import { create } from "zustand";
import type { ConversationItem } from "@openim/wasm-client-sdk/lib/types/entity";
import { researchApi } from "./api";

type State = {
  generation: number;
  refreshSequence: number;
  session?: ResponseFor<"imSession">["data"];
  actor?: ResponseFor<"session">["data"];
  // The RAP actor paired with this IM session, distinct from later actor refreshes.
  sessionActorId?: string;
  contacts: ResponseFor<"imContacts">["data"]["contacts"];
  mappings: ResponseFor<"imConversations">["data"]["conversations"];
  // A real SDK GetOneConversation result keeps the fixed entry available before
  // the SDK's initial local conversation list has finished synchronizing.
  coordinatorConversation?: ConversationItem;
  coordinatorPinPending: boolean;
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
  coordinatorPinPending: false,
  error: "",
  setSession: (session, actor) =>
    set((state) => ({
      session,
      actor,
      sessionActorId: actor.member.id,
      error: "",
      coordinatorConversation: undefined,
      coordinatorPinPending: false,
      generation: state.generation + 1,
    })),
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
      sessionActorId: undefined,
      contacts: [],
      mappings: [],
      coordinatorConversation: undefined,
      coordinatorPinPending: false,
      error: "",
    })),
}));

import { assign, createActor, setup, fromPromise } from "xstate";
import { speechstate } from "speechstate";
import type { Settings } from "speechstate";
import type { DMEvents, DMContext, Message } from "./types";
import { KEY } from "./azure.ts";
import { fetchChatCompletion } from "./ollama";

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    sst_prepare: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
    sst_speak: ({ context, event }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: { utterance: (event as any).value || context.messages[context.messages.length - 1].content },
      }),
    sst_listen: ({ context }) => context.spstRef.send({ type: "LISTEN" }),
  },
  actors: {
    chatCompletion: fromPromise(async ({ input }: { input: { messages: Message[] } }) => {
      const response = await fetchChatCompletion(input.messages);
      return response;
    }),
  },
}).createMachine({
  id: "DM",
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: "",
    messages: [
      {
        role: "system",
        content: "You are a helpful voice assistant. Keep your responses very brief and conversational - maximum 2 short sentences. Use simple, natural language suitable for speech."
      },
      {
        role: "assistant",
        content: "Hello! I'm your voice assistant. How can I help you?"
      }
    ],
  }),
  initial: "Prepare",
  states: {
    Prepare: {
      entry: "sst_prepare",
      on: {
        ASRTTS_READY: "Loop",
      },
    },
    Loop: {
      initial: "Speaking",
      states: {
        Speaking: {
          entry: ({ context }) => {
            const lastMessage = context.messages[context.messages.length - 1];
            if (lastMessage.role === "assistant") {
              context.spstRef.send({
                type: "SPEAK",
                value: { utterance: lastMessage.content },
              });
            }
          },
          on: {
            SPEAK_COMPLETE: "Ask",
          },
        },
        Ask: {
          entry: "sst_listen",
          on: {
            RECOGNISED: {
              actions: assign(({ context, event }) => {
                const utterance = event.value[0]?.utterance || "";
                return {
                  lastResult: utterance,
                  messages: [
                    ...context.messages,
                    { role: "user" as const, content: utterance }
                  ],
                };
              }),
            },
            LISTEN_COMPLETE: "ChatCompletion",
          },
        },
        ChatCompletion: {
          invoke: {
            src: "chatCompletion",
            input: ({ context }) => ({
              messages: context.messages,
            }),
            onDone: {
              target: "Speaking",
              actions: assign(({ context, event }) => ({
                messages: [
                  ...context.messages,
                  { role: "assistant" as const, content: event.output }
                ],
              })),
            },
            onError: {
              target: "Speaking",
              actions: assign(({ context }) => ({
                messages: [
                  ...context.messages,
                  { 
                    role: "assistant" as const, 
                    content: "Sorry, I could not understand that. Could you try again?" 
                  }
                ],
              })),
            },
          },
        },
      },
    },
  },
});

const dmActor = createActor(dmMachine, {}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("Messages:", state.context.messages);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta()
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}

import type { Message } from "./types";

/*
export type Message = {
  role: "assistant" | "user" | "system";
  content: string;
};

system - LLM instructions
user - our speech
assistant - the models response
  
*/

const OLLAMA_API_URL = "http://localhost:11434/api/chat"; // terminal command: xvanzv@ml-231208-002 lab2 % ssh -p 62266 -L 11434:127.0.0.1:11434 xvanzv@mltgpu.flov.gu.se

export async function fetchChatCompletion(messages: Message[]): Promise<string> { // a function that takes messages as parameter and returns promise (in the dox. assistant's response, asynchronously)
  console.log("Calling Ollama with messages:", messages); // debug log
  
  try { // this is the api call in error handling
    const response = await fetch(OLLAMA_API_URL, { // http req
      method: "POST", // send data to server, not only retrieving with GET
      headers: {
        "Content-Type": "application/json", // sending json data (why is that agan?)
      },
      body: JSON.stringify({ // req the js object as json string
        model: "gemma2:latest", // "curl http://localhost:11434/api/tags" to change them. 
        messages: messages, // conversation history
        stream: false, // getting complete response
      }),
    });

	// error handling
    if (!response.ok) { // if http req is not good
      const errorText = await response.text(); // getting details (of the potential error)
      console.error("Ollama API error:", response.status, errorText); // log it
      throw new Error(`Ollama API error: ${response.status}`); // manually logging to be catched by try-catch
    }

    const data = await response.json();
    console.log("Ollama response:", data);
    
    // ollama format is: data.message.content
    const assistantMessage = data.message.content;
    return assistantMessage;
    
    
    // most likely error would be ssh tunnel creation being forgettable after a potential reboot, maybe a bash script can be executed before this. But since it requires password (ssh -f -N -p 62266 -L 11434:127.0.0.1:11434 guskarabo@mltgpu.flov.gu.se), it might not be safe. better to open the tunnel beforehand.
    // or maybe json format is bad, network bad, data.message.content is undefined...
  } catch (error) {
    console.error("Error calling Ollama:", error);
    return "Error while connecting to the language model. Probably ssh tunnel is not active.";
  }
}

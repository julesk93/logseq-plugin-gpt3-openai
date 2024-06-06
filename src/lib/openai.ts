//import { execFile } from 'child_process';
//import { promisify } from 'util';
//import path from 'path';
import {
  ChatCompletionRequestMessage,
  Configuration,
  CreateChatCompletionResponse,
  CreateCompletionResponse,
  CreateImageRequestSizeEnum,
  OpenAIApi
} from "openai";
import { backOff } from 'exponential-backoff';
import fetch from 'cross-fetch';

//const execFilePromise = promisify(execFile);

export type DalleImageSize = 256 | 512 | 1024;
export interface OpenAIOptions {
  apiKey: string;
  completionEngine?: string;
  temperature?: number;
  maxTokens?: number;
  dalleImageSize?: DalleImageSize;
  chatPrompt?: string;
  completionEndpoint?: string;
}


export async function fetchRecipe(input: string, openAiOptions: OpenAIOptions): Promise<any> {
  const options = { ...OpenAIDefaults(openAiOptions.apiKey), ...openAiOptions };
  const configuration = new Configuration({
    apiKey: options.apiKey,
  });
  const openai = new OpenAIApi(configuration);

  let content = input;
  if (input.startsWith("http")) {
    try {
      content = await fetchHtmlContent(input);
      console.log("Fetched HTML Content:", content); // Debug output
      content = extractMainText(content);
      const maxLength = 5000; 
      if (content.length > maxLength) {
        console.warn(`Truncating extracted HTML content to ${maxLength} characters`);
        content = content.substring(0, maxLength);
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error fetching HTML content: ${error.message}`);
      } else {
        console.error(`Unexpected error: ${error}`);
      }
      throw new Error("Failed to fetch HTML content.");
    }
  }

  const messages: ChatCompletionRequestMessage[] = [
    {
      role: "system",
      content: `You are a helpful assistant. Extract the recipe from the content provided. If nutrition information is not provided, calculate based on ingredients. Use metric units. If the content is in English, translate to German. Return the extracted recipe as a JSON object with the following fields: title, description, list of ingredients (combine quantity, unit and ingredient as one list item), individual ingredients (only list ingredients without quantity and unit), instructions (one list item per step), prep_time, cook_time, total_time, servings, nutrition_information, cuisine, category, tags. Here is the recipe:`
    },
    { role: "user", content: content }
  ];

  try {
    const response = await backOff(() =>
      openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages,
        max_tokens: 3000,
        temperature: 0.5,
      }),
      {
        numOfAttempts: 7,
        retry: (error: any) => {
          if (error.response && error.response.status === 429) {
            console.warn("Rate limit exceeded. Retrying...");
            return true;
          }
          return false;
        },
      }
    );

    const responseText = response.data.choices[0]?.message?.content || "{}";
    try {
      return JSON.parse(responseText);
    } catch (error) {
      if (error instanceof Error) {
        console.error("Failed to decode JSON:", responseText, error);
      } else {
        console.error("Unexpected error while decoding JSON:", responseText, error);
      }
      throw new Error("Failed to decode JSON");
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("OpenAI API call error:", error.message);
    } else {
      console.error("Unexpected error during OpenAI API call:", error);
    }
    throw new Error("Failed to fetch recipe from OpenAI API.");
  }
}

async function fetchHtmlContent(url: string): Promise<string> {
  const response = await fetch(url);
  const html = await response.text();
  return html;
}

function extractMainText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  function getTextContent(element: Element): string {
    const children = Array.from(element.childNodes);
    return children.map(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        return (child.textContent || '').trim();
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        return getTextContent(child as Element);
      } else {
        return '';
      }
    }).join(' ').replace(/\s+/g, ' ').trim();
  }

  const body = doc.body;
  if (!body) {
    return '';
  }

  const text = getTextContent(body);
  console.log("Extracted Text:", text); // Debug output
  return text.substring(0, 2000); // Update to match maxLength
}

const OpenAIDefaults = (apiKey: string): OpenAIOptions => ({
  apiKey,
  completionEngine: "gpt-3.5-turbo",
  temperature: 1.0,
  maxTokens: 1000,
  dalleImageSize: 1024,
});

const retryOptions = {
  numOfAttempts: 7,
  retry: (err: any) => {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      // Handle the TypeError: Failed to fetch error
      console.warn('retrying due to network error', err);
      return true;
    }

    if (!err.response || !err.response.data || !err.response.data.error) {
      return false;
    }
    if (err.response.status === 429) {
      const errorType = err.response.data.error.type;
      if (errorType === "insufficient_quota") {
        return false;
      }
      console.warn("Rate limit exceeded. Retrying...");
      return true;
    }
    if (err.response.status >= 500) {
      return true;
    }

    return false;
  },
};

export async function whisper(file: File,openAiOptions:OpenAIOptions): Promise<string> {
    const apiKey = openAiOptions.apiKey;
    const baseUrl = openAiOptions.completionEndpoint ? openAiOptions.completionEndpoint : "https://api.openai.com/v1";
    const model = 'whisper-1';
  
    // Create a FormData object and append the file
    const formData = new FormData();
    formData.append('model', model);
    formData.append('file', file);
  
    // Send a request to the OpenAI API using a form post
    const response = await backOff(

    () => fetch(baseUrl + '/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    }), retryOptions);

    // Check if the response status is OK
    if (!response.ok) {
      throw new Error(`Error transcribing audio: ${response.statusText}`);
    }

    // Parse the response JSON and extract the transcription
    const jsonResponse = await response.json();
    return jsonResponse.text;
  }

export async function dallE(
  prompt: string,
  openAiOptions: OpenAIOptions
): Promise<string | undefined> {
  const options = { ...OpenAIDefaults(openAiOptions.apiKey), ...openAiOptions };

  const configuration = new Configuration({
    apiKey: options.apiKey,
    basePath: options.completionEndpoint
  });

  const openai = new OpenAIApi(configuration);
  const imageSizeRequest: CreateImageRequestSizeEnum =
    `${options.dalleImageSize}x${options.dalleImageSize}` as CreateImageRequestSizeEnum;

  const response = await backOff(
    () =>
      openai.createImage({
        prompt,
        n: 1,
        size: imageSizeRequest,
      }),
    retryOptions
  );
  return response.data.data[0].url;
}

export async function openAI(
  input: string,
  openAiOptions: OpenAIOptions
): Promise<string | null> {
  const options = { ...OpenAIDefaults(openAiOptions.apiKey), ...openAiOptions };
  const engine = options.completionEngine!;

  const configuration = new Configuration({
    basePath: options.completionEndpoint,
    apiKey: options.apiKey,
  });

  const openai = new OpenAIApi(configuration);
  try {
    if (engine.startsWith("gpt-3.5") || engine.startsWith("gpt-4")) {
      const inputMessages:ChatCompletionRequestMessage[] =  [{ role: "user", content: input }];
      if (openAiOptions.chatPrompt && openAiOptions.chatPrompt.length > 0) {
        inputMessages.unshift({ role: "system", content: openAiOptions.chatPrompt });

      }
      const response = await backOff(
        () =>
          openai.createChatCompletion({
            messages: inputMessages,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            model: engine,
          }),
        retryOptions
      );
      const choices = response.data.choices;
      if (
        choices &&
        choices[0] &&
        choices[0].message &&
        choices[0].message.content &&
        choices[0].message.content.length > 0
      ) {
        return trimLeadingWhitespace(choices[0].message.content);
      } else {
        return null;
      }
    } else {
      const response = await backOff(() =>
        openai.createCompletion({
          prompt: input,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
          model: engine,
        }),
        retryOptions
      );
      const choices = response.data.choices;
      if (
        choices &&
        choices[0] &&
        choices[0].text &&
        choices[0].text.length > 0
      ) {
        return trimLeadingWhitespace(choices[0].text);
      } else {
        return null;
      }
    }
  } catch (e: any) {
    if (e?.response?.data?.error) {
      console.error(e?.response?.data?.error);
      throw new Error(e?.response?.data?.error?.message);
    } else {
      throw e;
    }
  }
}

export async function openAIWithStream(
  input: string,
  openAiOptions: OpenAIOptions,
  onContent: (content: string) => void,
  onStop: () => void
): Promise<string | null> {
  const options = { ...OpenAIDefaults(openAiOptions.apiKey), ...openAiOptions };
  const engine = options.completionEngine!;

  try {
    if (engine.startsWith("gpt-3.5") || engine.startsWith("gpt-4")) {
      const inputMessages: ChatCompletionRequestMessage[] = [{ role: "user", content: input }];
      if (openAiOptions.chatPrompt && openAiOptions.chatPrompt.length > 0) {
        inputMessages.unshift({ role: "system", content: openAiOptions.chatPrompt });
      }
      const body = {
        messages: inputMessages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        model: engine,
        stream: true
      }
      const response = await backOff(
        () =>
          fetch(`${options.completionEndpoint}/chat/completions`, {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream'
            }
          }).then((response) => {
            if (response.ok && response.body) {
              const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
              let result = ""
              const readStream = (): any =>
                reader.read().then(({
                                      value,
                                      done
                                    }) => {
                  if (done) {
                    reader.cancel();
                    onStop();
                    return Promise.resolve({ choices: [{ message: { content: result } }] });
                  }

                  const data = getDataFromStreamValue(value);
                  if (!data || !data[0]) {
                    return readStream();
                  }

                  let res = ""
                  for (let i = 0; i < data.length; i++) {
                    res += data[i].choices[0]?.delta?.content || ""
                  }
                  result += res
                  onContent(res)
                  return readStream();
                });
              return readStream();
            } else {
              return Promise.reject(response);
            }
          }),
        retryOptions
      );
      const choices = (response as CreateChatCompletionResponse)?.choices;
      if (
        choices &&
        choices[0] &&
        choices[0].message &&
        choices[0].message.content &&
        choices[0].message.content.length > 0
      ) {
        return trimLeadingWhitespace(choices[0].message.content);
      } else {
        return null;
      }
    } else {
      const body = {
        prompt: input,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
        model: engine,
        stream: true
      }
      const response = await backOff(
        () =>
          fetch(`${options.completionEndpoint}/completions`, {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'text/event-stream'
            }
          }).then((response) => {
            if (response.ok && response.body) {
              const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
              let result = ""
              const readStream = (): any =>
                reader.read().then(({
                                      value,
                                      done
                                    }) => {
                  if (done) {
                    reader.cancel();
                    onStop();
                    return Promise.resolve({ choices: [{ text: result }]});
                  }

                  const data = getDataFromStreamValue(value);
                  if (!data || !data[0]) {
                    return readStream();
                  }

                  let res = ""
                  for (let i = 0; i < data.length; i++) {
                    res += data[i].choices[0]?.text || ""
                  }
                  result += res
                  onContent(res)
                  return readStream();
                });
              return readStream();
            } else {
              return Promise.reject(response);
            }
          }),
        retryOptions
      );
      const choices = (response as CreateCompletionResponse)?.choices;
      if (
        choices &&
        choices[0] &&
        choices[0].text &&
        choices[0].text.length > 0
      ) {
        return trimLeadingWhitespace(choices[0].text);
      } else {
        return null;
      }
    }
  } catch (e: any) {
    if (e?.response?.data?.error) {
      console.error(e?.response?.data?.error);
      throw new Error(e?.response?.data?.error?.message);
    } else {
      throw e;
    }
  }
}

function getDataFromStreamValue(value: string) {
  const matches = [...value.split("data:")];
  return matches.filter(content => content.trim().length > 0 && !content.trim().includes("[DONE]"))
    .map(match =>{
      try{
        return JSON.parse(match)
      } catch(e) {
        return null
      }
    });
}

function trimLeadingWhitespace(s: string): string {
  return s.replace(/^\s+/, "");
}

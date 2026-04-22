import Groq from "groq-sdk";

export const callGroqReasoning = async (
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  isJson: boolean = false,
  modelName: string = 'llama-3.3-70b-versatile'
) => {
  if (!apiKey) throw new Error("Groq API key missing");

  const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
  
  const options: any = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    model: modelName,
  };

  if (isJson) {
    options.response_format = { type: 'json_object' };
  }

  const chatCompletion = await groq.chat.completions.create(options);
  return chatCompletion.choices[0]?.message?.content || '';
};

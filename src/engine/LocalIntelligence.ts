import { InMemoryCache } from "@langchain/core/caches";
import nlp from 'compromise';
import { Architect } from 'synaptic';

// Global cache to reduce API quota exhaustion
export const globalAiCache = new InMemoryCache();

// Initialize a local Neural Network for complexity scoring (Synaptic)
// 3 inputs (length, question mark presence, complex word count), 4 hidden, 1 output (complexity score)
const complexityNetwork = new Architect.Perceptron(3, 4, 1);

export const analyzeLocalNLP = (text: string) => {
  const doc = nlp(text);
  
  // Basic intent detection using Compromise NLP
  const isGreeting = doc.has('#Greeting') || doc.match('(hi|hello|hey|yo|sup|ping)').found;
  const isFarewell = doc.match('(bye|goodbye|cya|see ya|later)').found;
  const isAgreement = doc.match('^(yes|yeah|yep|sure|ok|okay|agree)$').found;
  const isQuestion = doc.questions().found;
  
  // Extract core entities/topics
  const topics = doc.nouns().out('array');
  const verbs = doc.verbs().out('array');

  // Neural Network Complexity Heuristic
  const lengthScore = Math.min(text.length / 100, 1); // Normalize length
  const hasQuestionScore = isQuestion ? 1 : 0;
  const complexWordsScore = Math.min(topics.length / 5, 1); // Normalize topic count
  
  // Activate the network to get a complexity score (0 to 1)
  const complexityScore = complexityNetwork.activate([lengthScore, hasQuestionScore, complexWordsScore])[0];

  return {
    isGreeting,
    isFarewell,
    isAgreement,
    isQuestion,
    topics,
    verbs,
    complexityScore,
    requiresDeepAI: complexityScore > 0.6 || isQuestion || topics.length > 2
  };
};

export const getCachedResponse = async (prompt: string): Promise<string | undefined> => {
  const cached = await globalAiCache.lookup(prompt, "default");
  if (cached && cached.length > 0) {
    return cached[0].text;
  }
  return undefined;
};

export const setCachedResponse = async (prompt: string, response: string): Promise<void> => {
  await globalAiCache.update(prompt, "default", [{ text: response }]);
};

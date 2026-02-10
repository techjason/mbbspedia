import Mixedbread from "@mixedbread/sdk";

let cachedClient: Mixedbread | null = null;

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getMixedbreadClient(): Mixedbread {
  if (cachedClient) return cachedClient;

  const apiKey = getRequiredEnv("MIXEDBREAD_API_KEY");
  const baseURL = process.env.MIXEDBREAD_BASE_URL;

  cachedClient = new Mixedbread({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });

  return cachedClient;
}

import { Type, type Tool } from "@google/genai";

export async function get_github_info(username: string) {
  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, {
        headers: { "User-Agent": "CV-Screener-App" }
      }),
      fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=5`, {
        headers: { "User-Agent": "CV-Screener-App" }
      })
    ]);

    if (!userRes.ok) return { error: "GitHub user not found" };

    const userData = (await userRes.json()) as Record<string, any>;
    const reposData = (await reposRes.json()) as Array<Record<string, any>>;

    return {
      name: userData.name,
      bio: userData.bio,
      public_repos: userData.public_repos,
      followers: userData.followers,
      top_recent_repos: reposData.map((repo) => ({
        name: repo.name,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count
      }))
    };
  } catch (error) {
    return { error: "Failed to fetch GitHub data" };
  }
}

export async function get_linkedin_info(url: string) {
  return {
    profile_url: url,
    note: "LinkedIn data extraction requires official API access. Use the URL to verify candidate identity manually."
  };
}
export const tools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_github_info",
        description: "Panggil fungsi ini jika menemukan username atau link GitHub di dalam CV untuk mengambil data portofolio kodenya.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            username: { type: Type.STRING, description: "Username GitHub yang ditemukan di CV" }
          },
          required: ["username"]
        }
      },
      {
        name: "get_linkedin_info",
        description: "Panggil fungsi ini jika menemukan URL LinkedIn di dalam CV.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: { type: Type.STRING, description: "URL lengkap profil LinkedIn" }
          },
          required: ["url"]
        }
      }
    ]
  }
];
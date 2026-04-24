import { Form, useNavigation, data } from "react-router";
import type { Route } from "./+types/home";
import { getSession, commitSession } from "~/sessions.server";
import { GoogleGenAI } from "@google/genai";
import { Buffer } from "node:buffer";
import { useState } from "react";

import { get_github_info, get_linkedin_info, tools } from "~/utils/tools.server";

export function meta() {
  return [{ title: "CV Screener" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const today = new Date().toISOString().split("T")[0];
  const usage = session.get("usage") || { date: today, count: 0 };
  
  return { 
    usageCount: usage.date === today ? usage.count : 0,
    maxLimit: 10
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const today = new Date().toISOString().split("T")[0];
  let usage = session.get("usage") || { date: today, count: 0 };

  if (usage.date !== today) usage = { date: today, count: 0 };

  if (usage.count >= 10) {
    return data(
      { error: "MAXIMUM DAILY TELEMETRY (10/10) REACHED.", result: null },
      { status: 429 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("cv") as File | null;

  if (!file || file.type !== "application/pdf") {
    return data({ error: "INVALID FORMAT. PDF REQUIRED.", result: null }, { status: 400 });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64Pdf = Buffer.from(arrayBuffer).toString("base64");

    const ai = new GoogleGenAI({ apiKey: context.cloudflare.env.GEMINI_API_KEY });
    
    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        tools: tools,
        temperature: 0.2
      }
    });

    const promptText = `
      You are a ruthless, highly sarcastic, and elitist senior tech recruiter. Your sole purpose is to ruthlessly roast, mock, and destroy the attached CV document. Analyze it thoroughly to find every pathetic flaw.
      
      CRITICAL INSTRUCTIONS:
      1. Scan the document for any GitHub usernames or LinkedIn URLs. If found, call the provided tools to fetch external data so you can mock their actual portfolio too.
      2. Detect the primary language of the CV and write your final response ENTIRELY in that same language. If it's Indonesian, be extremely snarky, sarcastic, and "julid".
      3. You MUST return ONLY a valid JSON object with exactly these keys:
         "rating": (string, give a brutally low score out of 10, e.g., "2/10 (Delusional)"),
         "roasting": (string, a very long, highly sarcastic, and mocking paragraph. At least 5-8 sentences. Tear apart their formatting, empty buzzwords, pathetic experience, and the overall audacity of submitting this garbage. Make it personal to the contents of their CV),
         "suggestion": (array of strings, exactly 3 very long, detailed, actionable but highly condescending suggestions. Tell them exactly what to fix, but phrase it as if you are explaining basic common sense to an absolute amateur).
      Do not include any markdown formatting like \`\`\`json.
    `;

    let response = await chat.sendMessage({
      message: [
        promptText,
        {
          inlineData: {
            data: base64Pdf,
            mimeType: "application/pdf"
          }
        }
      ]
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      const functionResponses: any[] = [];
      
      for (const call of response.functionCalls) {
        if (call.name === "get_github_info") {
          const args = call.args as { username: string };
          const result = await get_github_info(args.username);
          functionResponses.push({
            functionResponse: { name: call.name, response: result }
          });
        } else if (call.name === "get_linkedin_info") {
          const args = call.args as { url: string };
          const result = await get_linkedin_info(args.url);
          functionResponses.push({
            functionResponse: { name: call.name, response: result }
          });
        }
      }

      if (functionResponses.length > 0) {
        response = await chat.sendMessage({ message: functionResponses });
      }
    }

    usage.count += 1;
    session.set("usage", usage);

    let parsedResult;
    const responseText = response.text;

    if (!responseText) {
      return data({ error: "AI RETURNED EMPTY RESPONSE.", result: null }, { status: 400 });
    }

    try {
      const cleanJson = responseText.replace(/```json/gi, '').replace(/```/gi, '').trim();
      parsedResult = JSON.parse(cleanJson);
    } catch (e) {
      parsedResult = { raw: responseText };
    }

    return data(
      { result: parsedResult, error: null },
      { headers: { "Set-Cookie": await commitSession(session) } }
    );
  } catch (error) {
    console.error(error);
    return data({ error: "SYSTEM FAILURE DURING ANALYSIS", result: null }, { status: 500 });
  }
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const isAnalyzing = navigation.state === "submitting";
  const [fileName, setFileName] = useState<string | null>(null);

  const result = actionData?.result as any;

  return (
    <main className="min-h-[100dvh] bg-[#F4F4F0] text-[#050505] font-sans selection:bg-[#E61919] selection:text-white pb-12">
      <header className="p-4 md:p-8 border-b-2 border-[#050505]">
        <h1 className="text-[clamp(3rem,8vw,8rem)] font-black uppercase tracking-[-0.04em] leading-[0.9]">
          CV Screener <br />
          <span className="text-[#E61919]">Sys.01</span>
        </h1>
        <div className="flex justify-between items-end mt-4 font-mono text-sm tracking-wider font-bold">
          <p>QUOTA: {loaderData.usageCount}/{loaderData.maxLimit}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[2px] bg-[#050505] border-b-2 border-[#050505]">
        
        {/* INPUT */}
        <section className="bg-[#F4F4F0] p-4 md:p-8 flex flex-col h-full">
          <div className="border-b-2 border-[#050505] pb-2 mb-6 font-mono text-xs font-bold flex justify-between">
            <span>INPUT :: PDF UPLOAD</span>
            <span>[ REQ ]</span>
          </div>

          <Form method="post" encType="multipart/form-data" className="flex flex-col flex-1 gap-6">
            <div className="flex-1 min-h-[400px] flex flex-col justify-center items-center border-2 border-[#050505] p-4 relative group hover:bg-[#050505] transition-none cursor-pointer">
              <input
                type="file"
                name="cv"
                accept="application/pdf"
                required
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={isAnalyzing || loaderData.usageCount >= 10}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setFileName(file ? file.name : null);
                }}
              />
              <div className="text-center font-mono group-hover:text-white pointer-events-none">
                {fileName ? (
                  <>
                    <p className="text-xl font-bold mb-2 text-[#E61919] group-hover:text-[#E61919]">
                      [ {fileName} ]
                    </p>
                    <p className="text-sm opacity-50">FILE SELECTED - READY</p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-bold mb-2">[ SELECT .PDF FILE ]</p>
                    <p className="text-sm opacity-50">CLICK OR DRAG TO UPLOAD</p>
                  </>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={isAnalyzing || loaderData.usageCount >= 10 || !fileName}
              className="bg-[#E61919] text-white p-4 font-bold uppercase tracking-widest text-lg border-2 border-transparent hover:bg-[#050505] disabled:bg-gray-400 disabled:cursor-not-allowed transition-none rounded-none"
            >
              {isAnalyzing ? ">>> UPLOADING & ANALYZING..." : ">>> INITIATE SCAN"}
            </button>
          </Form>
        </section>

        {/* OUTPUT */}
        <section className="bg-[#F4F4F0] p-4 md:p-8 flex flex-col h-full">
          <div className="border-b-2 border-[#050505] pb-2 mb-6 font-mono text-xs font-bold flex justify-between">
            <span>OUTPUT :: TELEMETRY DATA</span>
            <span className={actionData?.error ? "text-[#E61919]" : ""}>
              {actionData?.error ? "[ ERR ]" : "[ OK ]"}
            </span>
          </div>

          <div className="flex-1 w-full bg-transparent border-2 border-[#050505] p-6 overflow-auto rounded-none relative">
            {actionData?.error && (
              <div className="text-[#E61919] font-mono font-bold text-sm mb-4">
                !!! {actionData.error}
              </div>
            )}
            
            {result ? (
              <div className="font-mono flex flex-col gap-8">
                {result.rating ? (
                  <>
                    <div>
                      <h3 className="text-[#E61919] font-bold text-xs mb-2">/// RATING</h3>
                      <p className="text-5xl font-black">{result.rating}</p>
                    </div>

                    <div>
                      <h3 className="text-[#E61919] font-bold text-xs mb-2">/// ROASTING</h3>
                      <p className="text-sm leading-relaxed uppercase">{result.roasting}</p>
                    </div>

                    <div>
                      <h3 className="text-[#E61919] font-bold text-xs mb-4">/// SUGGESTION</h3>
                      <ul className="flex flex-col gap-3">
                        {Array.isArray(result.suggestion) && result.suggestion.map((item: string, idx: number) => (
                          <li key={idx} className="flex gap-4 text-sm leading-relaxed border-l-2 border-[#050505] pl-3">
                            <span className="font-bold opacity-50">0{idx + 1}</span>
                            <span className="uppercase">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap uppercase">
                    {result.raw}
                  </div>
                )}
              </div>
            ) : (
              <div className="font-mono text-sm text-[#050505]/50 flex items-center justify-center h-full min-h-[300px]">
                [ WAITING FOR DATA INGESTION ]
              </div>
            )}
            
            <div className="absolute top-2 right-2 font-mono text-[10px] text-[#050505]/30">+</div>
            <div className="absolute bottom-2 left-2 font-mono text-[10px] text-[#050505]/30">+</div>
          </div>
        </section>

      </div>
    </main>
  );
}
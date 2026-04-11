// Use a try-catch that specifically returns a valid JSON response even on failure
export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { fileName, content } = JSON.parse(event.body);
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const REPO_OWNER = "squares2";
    const REPO_NAME = "delivery-plus";

    // Use globalThis.fetch to ensure it uses the built-in Node fetch if available
    const response = await fetch(
      `"https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${fileName}`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.github+json"
        },
        body: JSON.stringify({
          message: `Upload ${fileName}`,
          content: content,
          branch: "main"
        })
      }
    );

    const result = await response.json();
    
    // EXPLICITLY return JSON headers to prevent Protocol Errors
    return {
      statusCode: response.status,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    };
  } catch (err) {
    // If it crashes, send a clean JSON error back
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};

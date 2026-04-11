export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const data = JSON.parse(event.body);
    const { fileName, content } = data;

    // 1. Get your Token from Netlify Environment Variables
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
    const REPO_OWNER = "squares"; // <-- CHANGE THIS
    const REPO_NAME = "delivery-plus";       // <-- CHANGE THIS

    // 2. The actual logic to send the file to GitHub
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${fileName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: `Upload profile image: ${fileName}`,
          content: content, // This is the base64 string
          branch: "main"    // Make sure your branch is named 'main'
        }),
      }
    );

    const result = await response.json();

    if (response.ok) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "Image successfully saved to GitHub!" }),
      };
    } else {
      // If GitHub rejects it, return GitHub's specific error message
      return { statusCode: response.status, body: JSON.stringify(result) };
    }

  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Internal Error: " + err.message }),
    };
  }
};

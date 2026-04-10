// This runs on the server, so your token is hidden from the browser
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { fileName, content, sha } = JSON.parse(req.body);
  const GITHUB_TOKEN = process.env.MY_GITHUB_TOKEN; // We will set this in Netlify/Vercel settings

  const url = `https://github.com{fileName}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: `Update profile image: ${fileName}`,
      content: content,
      sha: sha
    })
  });

  const data = await response.json();
  res.status(response.status).json(data);
}

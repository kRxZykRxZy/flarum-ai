// forum-brain.js
require('dotenv').config();
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const natural = require('natural');

const FLARUM_URL = process.env.FLARUM_URL;
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const CONFIDENCE_THRESHOLD = parseFloat(process.env.REPLY_CONFIDENCE) || 0.8;

const tokenizer = new natural.WordTokenizer();
const tfidf = new natural.TfIdf();
let knowledgeBase = [];

const db = new sqlite3.Database('forum_ai.db');

function initializeDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      content TEXT
    )
  `);
}

async function loginFlarum(username, password) {
  const res = await axios.post(`${FLARUM_URL}/api/token`, {
    identification: username,
    password: password,
  });
  return res.data.token;
}

async function fetchDiscussions(token) {
  const res = await axios.get(`${FLARUM_URL}/api/discussions?page[limit]=10`, {
    headers: { Authorization: `Token ${token}` },
  });
  return res.data.data;
}

async function fetchPosts(discussionId, token) {
  const res = await axios.get(`${FLARUM_URL}/api/discussions/${discussionId}`, {
    headers: { Authorization: `Token ${token}` },
  });

  const included = res.data.included || [];
  return included
    .filter((item) => item.type === 'posts')
    .map((post) => ({
      id: post.id,
      content: post.attributes.content,
      discussionId,
    }));
}

function addToKnowledgeBase(id, content) {
  db.get('SELECT id FROM posts WHERE id = ?', [id], (err, row) => {
    if (!row) {
      db.run('INSERT INTO posts (id, content) VALUES (?, ?)', [id, content]);
      tfidf.addDocument(content);
      knowledgeBase.push({ id, content });
    }
  });
}

function getSimilarityScores(input) {
  const inputTokens = tokenizer.tokenize(input.toLowerCase());
  return knowledgeBase.map((item, index) => {
    const docTokens = tokenizer.tokenize(item.content.toLowerCase());
    const allTokens = [...new Set(inputTokens.concat(docTokens))];
    const inputVec = allTokens.map(t => tfidf.tfidf(t, -1));
    const docVec = allTokens.map(t => tfidf.tfidf(t, index));
    const score = 1 - natural.Similarity.cosineDistance(inputVec, docVec);
    return { ...item, score };
  }).sort((a, b) => b.score - a.score);
}

async function postReply(token, discussionId, content) {
  const fullContent = content + "\n\nTHIS MESSAGE WAS SENT VIA KRXZY_KRXZY'S AI ASSISTANT";
  await axios.post(
    `${FLARUM_URL}/api/posts`,
    {
      data: {
        type: "posts",
        attributes: {
          content: fullContent,
        },
        relationships: {
          discussion: {
            data: {
              type: "discussions",
              id: discussionId,
            },
          },
        },
      },
    },
    {
      headers: { Authorization: `Token ${token}` },
    }
  );
}

async function learnAndRespond(token) {
  const discussions = await fetchDiscussions(token);

  for (const discussion of discussions) {
    const posts = await fetchPosts(discussion.id, token);

    for (const post of posts) {
      addToKnowledgeBase(post.id, post.content);
    }

    // Attempt to respond to latest post
    const lastPost = posts[posts.length - 1];
    const scores = getSimilarityScores(lastPost.content);
    const best = scores[0];

    if (best && best.score >= CONFIDENCE_THRESHOLD && best.id !== lastPost.id) {
      console.log(`🤖 Replying to discussion ${discussion.id} with confidence ${best.score.toFixed(2)}`);
      await postReply(token, discussion.id, best.content);
    }
  }
}

(async () => {
  initializeDB();
  console.log("🤖 Starting Billion Dollar Forum Brain...");
  const token = await loginFlarum(USERNAME, PASSWORD);

  // Initial load and learn
  await learnAndRespond(token);

  // Poll every 5 minutes
  setInterval(async () => {
    console.log("🔄 Checking for new content...");
    await learnAndRespond(token);
  }, 5 * 60 * 1000);
})();

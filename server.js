require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.use(limiter);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Custom error response
app.use((req, res, next) => {
  res.error = (message, status = 400, details = {}) => {
    return res.status(status).json({
      success: false,
      error: message,
      ...details
    });
  };
  next();
});

// Input validation
function validateCodeRequest(req) {
  if (!req.body || typeof req.body !== 'object') {
    throw new Error('Invalid request body');
  }

  if (!req.body.code || typeof req.body.code !== 'string' || req.body.code.trim().length < 3) {
    throw new Error('Code field must be a non-empty string.');
  }

  if (req.body.language) {
    const language = req.body.language.toLowerCase().trim();
    console.log('Received language:', language); // Debug log
    const supported = ['python', 'javascript', 'java', 'c++', 'c', 'html', 'css', 'php'];
    if (!supported.includes(language)) {
      throw new Error(`Unsupported language: ${language}`);
    }
  }
}

// Format code
function formatCode(code) {
  return code
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .join('\n');
}

// General feedback endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    validateCodeRequest(req);

    const language = (req.body.language || 'python').toLowerCase().trim();
    const difficulty = ['beginner', 'intermediate', 'advanced'].includes(req.body.difficulty)
      ? req.body.difficulty
      : 'beginner';

    const formattedCode = formatCode(req.body.code);

    // Detect natural language prompt
    const isRequest = /^[a-zA-Z\s?.,'"-]+$/.test(formattedCode.trim()) && formattedCode.includes(' ');

    const prompts = {
      beginner: isRequest
        ? `Provide ${language.toUpperCase()} code for this request:\n\n"${formattedCode}"`
        : `Explain this ${language.toUpperCase()} code to a beginner:\n\n${formattedCode}`,
      intermediate: isRequest
        ? `Write ${language.toUpperCase()} code to solve this:\n\n"${formattedCode}"`
        : `Analyze this ${language.toUpperCase()} code:\n\n${formattedCode}`,
      advanced: isRequest
        ? `Produce optimized ${language.toUpperCase()} code for this requirement:\n\n"${formattedCode}"`
        : `Expert review of this ${language.toUpperCase()} code:\n\n${formattedCode}`,
    };

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You are an expert coding tutor." },
        { role: "user", content: prompts[difficulty] },
      ],
      model: "llama3-70b-8192",
      temperature: 0.3,
      max_tokens: 1024,
    });

    res.json({
      success: true,
      feedback: completion.choices[0]?.message?.content,
      model: "llama3-70b-8192",
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.error(error.message, 500, {
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Specific feedback endpoint
app.post('/api/analyze-specific', async (req, res) => {
  try {
    validateCodeRequest(req);

    const language = (req.body.language || 'python').toLowerCase().trim();
    const requestType = ['explain', 'optimize', 'debug'].includes(req.body.requestType)
      ? req.body.requestType
      : 'explain';

    const prompts = {
      explain: `Explain this ${language} code:\n\n${req.body.code}`,
      optimize: `Optimize this ${language} code:\n\n${req.body.code}`,
      debug: `Debug this ${language} code:\n\n${req.body.code}`,
    };

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You are a code expert providing specific feedback." },
        { role: "user", content: prompts[requestType] },
      ],
      model: "llama3-70b-8192",
      temperature: 0.2,
      max_tokens: 1024,
    });

    res.json({
      success: true,
      feedback: completion.choices[0]?.message?.content,
      model: "llama3-70b-8192",
    });
  } catch (error) {
    console.error('Specific analysis error:', error);
    res.error(error.message, 500, {
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});

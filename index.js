const express = require('express');
const axios = require('axios');
require('dotenv').config(); // بارگذاری متغیرهای محیطی

const app = express();
const PORT = process.env.PORT || 9000;

app.get('/', async (req, res) => {
    const userMessage = req.query.text;

    if (!userMessage) {
        return res.status(400).json({ error: 'Message text is required' });
    }

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: userMessage }],
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        const botMessage = response.data.choices[0].message.content;
        res.json({ message: botMessage });
    } catch (error) {
        console.error('Error calling OpenAI API:', error); 
        res.status(500).json({ error: 'Error communicating with ChatGPT' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

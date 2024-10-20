const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const axios = require('axios');
const {
    getRandomResponse,
    addUser,
    addAdmin,
    removeAdmin,
    addLearningResponse,
    deleteResponsesByKeyword
} = require('./utils/responseManager');
const { getShamsiDate, getGregorianDate } = require('./utils/dateManager');
const config = require('./config.json');
const license = "P57RevNkK4eFrpvZe2W2wJ5WESy9XqkbAjPxkRetrNuWr";
const bot = new TelegramBot(config.token, { polling: true });

const apiResponsesCache = {};
const CACHE_EXPIRY_MS = 60000;

let admins = [];

// Load admins from the JSON file at the start
async function loadAdmins() {
    try {
        const data = await fs.readFile('./data/admins.json', 'utf8');
        admins = JSON.parse(data || '[]');
    } catch (err) {
        console.error('Error reading admins.json:', err);
    }
}

loadAdmins();

// Handle incoming messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";
    const userId = msg.from.id;

    await addUser(msg.from); // Ensure user is added to the database
    const isAdmin = admins.some(admin => admin.id === userId); // Check if the user is an admin

    // If no admins are loaded, add the first user as an admin if not already an admin
    if (admins.length === 0) {
        if (!isAdmin) {
            await addAdmin(msg.from);
            return bot.sendMessage(chatId, "شما به عنوان مدیر انتخاب شدید.");
        } else {
            return bot.sendMessage(chatId, "شما قبلاً به عنوان مدیر انتخاب شده‌اید.");
        }
    }

    // Handle AI queries
    if (text.startsWith("+")) {
        return await handleAiQuery(chatId, text.slice(1).trim(), msg.message_id);
    }

    // Handle admin commands if the user is an admin
    if (isAdmin) {
        return await handleAdminCommands(chatId, msg, text);
    }

    // Handle date requests
    if (text.includes("تاریخ")) {
        return await sendDate(chatId);
    }

    // Handle image requests
    if (text.toLowerCase().startsWith("عکس ")) {
        return await handleImageRequest(chatId, text.replace("عکس", "").trim());
    }

    // Handle random responses
    const response = await getRandomResponse(text);
    if (response) {
        await bot.sendMessage(chatId, response, { reply_to_message_id: msg.message_id });
    }
});

// Handle AI queries
async function handleAiQuery(chatId, query, messageId) {
    if (!query) {
        return bot.sendMessage(chatId, 'لطفاً یک پرسش معتبر وارد کنید.');
    }

    // Check cache for existing responses
    if (apiResponsesCache[query] && Date.now() - apiResponsesCache[query].timestamp < CACHE_EXPIRY_MS) {
        return bot.sendMessage(chatId, apiResponsesCache[query].response, { reply_to_message_id: messageId });
    }

    const api = `https://api3.haji-api.ir/lic/gpt/4?q=${encodeURIComponent(query)}&license=${license}`;
    try {
        const response = await axios.get(api);
        const aiResponse = response.data.result;

        // Check if the API response is valid
        if (!aiResponse) {
            return bot.sendMessage(chatId, 'پاسخی دریافت نشد.');
        }
        
        // Cache the API response
        apiResponsesCache[query] = { response: aiResponse, timestamp: Date.now() };
        return bot.sendMessage(chatId, aiResponse, { reply_to_message_id: messageId });
    } catch (error) {
        console.error('Error fetching AI response:', error);
        return bot.sendMessage(chatId, 'مشکلی در ارتباط با هوش مصنوعی وجود دارد.');
    }
}

// Handle admin commands
async function handleAdminCommands(chatId, msg, text) {
    const repliedUser = msg.reply_to_message?.from; // Get the user being replied to

    if (text === "ادمین" && repliedUser) {
        if (!admins.some(admin => admin.id === repliedUser.id)) {
            await addAdmin(repliedUser);
            return bot.sendMessage(chatId, `${repliedUser.first_name} به عنوان ادمین انتخاب شد.`);
        } else {
            return bot.sendMessage(chatId, `${repliedUser.first_name} قبلاً به عنوان ادمین انتخاب شده است.`);
        }
    }

    if (text === "عزل" && repliedUser) {
        const success = await removeAdmin(repliedUser);
        return bot.sendMessage(chatId, success ? `${repliedUser.first_name} از ادمینی حذف شد.` : `${repliedUser.first_name} ادمین نیست.`);
    }

    if (text.startsWith("حذف:")) {
        const keyword = text.replace("حذف:", "").trim();
        const success = await deleteResponsesByKeyword(keyword);
        return bot.sendMessage(chatId, success ? `پاسخ‌های مربوط به "${keyword}" با موفقیت حذف شد.` : `هیچ پاسخی برای "${keyword}" یافت نشد.`);
    }

    if (text.startsWith("یاد بگیر:")) {
        const parts = text.replace("یاد بگیر:", "").trim().split("!");
        const inputMessage = parts[0].trim();
        const responses = parts.slice(1).map(r => r.trim()).filter(r => r);

        if (responses.length > 0) {
            await addLearningResponse(inputMessage, responses);
            return bot.sendMessage(chatId, `پاسخ‌های جدید به "${inputMessage}" اضافه شد.`);
        } else {
            return bot.sendMessage(chatId, 'فرمت صحیح نیست. فرمت صحیح: یاد بگیر: ورودی! پاسخ1! پاسخ2');
        }
    }
}

// Send the current date
async function sendDate(chatId) {
    const shamsiDate = getShamsiDate();
    const gregorianDate = getGregorianDate();
    return bot.sendMessage(chatId, `تاریخ شمسی: ${shamsiDate}\nتاریخ میلادی: ${gregorianDate}`);
}

// Handle image requests
async function handleImageRequest(chatId, query) {
    const apiUrl = `https://api-free.ir/api/img.php?v=4&text=${encodeURIComponent(query)}`;

    try {
        const apiResponse = await axios.get(apiUrl);
        if (apiResponse.data?.result) {
            const images = apiResponse.data.result;
            const randomImage = images[Math.floor(Math.random() * images.length)];
            return bot.sendPhoto(chatId, randomImage);
        } else {
            return bot.sendMessage(chatId, `هیچ تصویری برای "${query}" یافت نشد.`);
        }
    } catch (error) {
        console.error('Error fetching image from API:', error);
        return bot.sendMessage(chatId, 'مشکلی در دریافت تصویر وجود دارد.');
    }
}

// api/telegram-webhook.js
// حل بسيط - فقط يعيد تأكيد أن Webhook يعمل

const TELEGRAM_BOT_TOKEN = '8931293118:AAHT6Ws1-_QPMQ4YxPExzf9CzHtTOjcJmtE';

export default async function handler(req, res) {
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'ok', message: 'Webhook is running!' });
    }
    
    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'ok' });
    }
    
    try {
        const body = req.body;
        
        if (body.callback_query) {
            const callback = body.callback_query;
            const callbackId = callback.id;
            
            // رد بسيط
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackId,
                    text: '⚠️ جاري التطوير، يرجى استخدام الأزرار قريباً',
                    show_alert: true
                })
            });
        }
        
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(200).json({ status: 'error' });
    }
}

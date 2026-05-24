// api/telegram-webhook.js

const TELEGRAM_BOT_TOKEN = '8931293118:AAHT6Ws1-_QPMQ4YxPExzf9CzHtTOjcJmtE';

const firebaseConfig = {
    apiKey: "AIzaSyAs3U2941_rNArLPpCYjKM9yAVQtiK-oDw",
    authDomain: "nabd-store-1.firebaseapp.com",
    databaseURL: "https://nabd-store-1-default-rtdb.firebaseio.com",
    projectId: "nabd-store-1",
    storageBucket: "nabd-store-1.firebasestorage.app",
    appId: "1:132078192935:web:2d4bc9e0dfcb407b2a8102"
};

// دالة تنظيف رقم الطلب
function cleanOrderNumber(rawNumber) {
    // إزالة #ORD- وتحويل إلى صيغة موحدة
    let cleaned = rawNumber.replace(/^#/, '').replace(/^ORD-/, '');
    return cleaned;
}

// دالة تحديث حالة الطلب
async function updateOrderStatus(orderNumber, newStatus) {
    try {
        const { initializeApp } = await import('firebase/app');
        const { getDatabase, ref, get, update } = await import('firebase/database');
        
        const app = initializeApp(firebaseConfig);
        const database = getDatabase(app);
        
        // تنظيف رقم الطلب
        const cleanNumber = cleanOrderNumber(orderNumber);
        console.log(`🔍 البحث عن الطلب: ${orderNumber} → cleaned: ${cleanNumber}`);
        
        // الحصول على جميع الطلبات
        const allOrdersRef = ref(database, 'all_orders');
        const snapshot = await get(allOrdersRef);
        const allOrders = snapshot.val();
        
        if (!allOrders) {
            console.log('❌ لا توجد طلبات');
            return false;
        }
        
        // البحث عن الطلب
        for (const [key, order] of Object.entries(allOrders)) {
            const orderNumberFromDb = order.orderNumber || order.number || order.orderId || '';
            const cleanDbNumber = cleanOrderNumber(orderNumberFromDb);
            
            console.log(`📋 مقارنة: "${cleanDbNumber}" مع "${cleanNumber}"`);
            
            if (cleanDbNumber === cleanNumber || 
                orderNumberFromDb.includes(cleanNumber) ||
                cleanNumber.includes(orderNumberFromDb)) {
                
                console.log(`✅ تم العثور على الطلب! المعرف: ${key}`);
                console.log(`📋 الحالة الحالية: ${order.status} → جديدة: ${newStatus}`);
                
                // تحديث الحالة
                await update(ref(database, `all_orders/${key}`), {
                    status: newStatus,
                    updatedAt: new Date().toISOString(),
                    updatedBy: 'telegram_bot'
                });
                
                return true;
            }
        }
        
        console.log(`❌ لم يتم العثور على الطلب: ${cleanNumber}`);
        return false;
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        return false;
    }
}

// دالة إرسال رسالة جديدة للتأكيد
async function sendTelegramMessage(chatId, message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });
        return await response.json();
    } catch (error) {
        console.error('خطأ:', error);
    }
}

// دالة تحديث الرسالة الأصلية
async function editMessage(chatId, messageId, newText) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text: newText,
                parse_mode: 'HTML'
            })
        });
        return response.ok;
    } catch (error) {
        console.error('خطأ:', error);
        return false;
    }
}

// دالة الرد على الضغط
async function answerCallback(callbackId, text, showAlert = true) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackId,
                text: text,
                show_alert: showAlert
            })
        });
        return await response.json();
    } catch (error) {
        console.error('خطأ:', error);
        return false;
    }
}

// ==================== WEBHOOK ====================
export default async function handler(req, res) {
    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: 'ok', 
            message: 'Webhook is running',
            time: new Date().toISOString()
        });
    }
    
    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'ok' });
    }
    
    try {
        const body = req.body;
        
        if (body.callback_query) {
            const callback = body.callback_query;
            const callbackData = callback.data;
            const callbackId = callback.id;
            const chatId = callback.message.chat.id;
            const messageId = callback.message.message_id;
            const originalText = callback.message.text || '';
            
            console.log(`🖱️ زر مضغوط: ${callbackData}`);
            
            if (callbackData.startsWith('order_')) {
                const parts = callbackData.split('_');
                const action = parts[1];
                // استخراج رقم الطلب (قد يحتوي على _)
                const orderNumber = parts.slice(2).join('_');
                
                console.log(`📋 الإجراء: ${action}, الرقم: ${orderNumber}`);
                
                const statusTexts = {
                    'delivered': '✅ تم التسليم',
                    'cancelled': '❌ ملغي',
                    'returned': '🔄 مرتجع',
                    'details': '📋 تفاصيل'
                };
                
                if (action === 'details') {
                    await answerCallback(callbackId, `📋 تفاصيل الطلب #${orderNumber}\nافتح لوحة التحكم في المتجر`, false);
                } 
                else if (action === 'delivered' || action === 'cancelled' || action === 'returned') {
                    // إعلام المستخدم بالبدء
                    await answerCallback(callbackId, `⏳ جاري تحديث الطلب...`, false);
                    
                    // محاولة تحديث الحالة
                    const success = await updateOrderStatus(orderNumber, action);
                    
                    if (success) {
                        const confirmMessage = `✅ تم تحديث الطلب بنجاح!\n\n📦 الطلب: #${orderNumber}\n📊 الحالة الجديدة: ${statusTexts[action]}\n🕐 الوقت: ${new Date().toLocaleString('ar-EG')}`;
                        
                        // إرسال رسالة تأكيد منفصلة
                        await sendTelegramMessage(chatId, confirmMessage);
                        
                        // تحديث الرسالة الأصلية (إزالة الأزرار)
                        const updatedText = originalText + `\n\n━━━━━━━━━━━━━━━━━━━━\n✅ <b>تم تغيير الحالة إلى: ${statusTexts[action]}</b>`;
                        await editMessage(chatId, messageId, updatedText);
                        
                        // تأكيد نهائي
                        await answerCallback(callbackId, `✅ تم تغيير حالة الطلب إلى ${statusTexts[action]}`, true);
                    } else {
                        await answerCallback(callbackId, `❌ لم يتم العثور على الطلب #${orderNumber}\n\nتأكد من رقم الطلب وحاول مرة أخرى`, true);
                    }
                }
            }
        }
        
        res.status(200).json({ status: 'ok' });
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(200).json({ status: 'error' });
    }
}

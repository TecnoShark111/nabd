// api/telegram-webhook.js
// ✅ هذا الكود يدعم الأزرار التفاعلية في التيليجرام

const TELEGRAM_BOT_TOKEN = '8931293118:AAHT6Ws1-_QPMQ4YxPExzf9CzHtTOjcJmtE';

export default async function handler(req, res) {
    // اختبار أن الويب هوك يعمل (GET request)
    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: 'ok', 
            message: 'Webhook is running!',
            time: new Date().toISOString()
        });
    }
    
    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'ok' });
    }
    
    try {
        const body = req.body;
        
        // معالجة الضغط على الأزرار
        if (body.callback_query) {
            const callback = body.callback_query;
            const callbackData = callback.data;
            const callbackId = callback.id;
            const chatId = callback.message.chat.id;
            const messageId = callback.message.message_id;
            const originalText = callback.message.text || '';
            
            console.log('✅ تم الضغط على زر:', callbackData);
            
            if (callbackData.startsWith('order_')) {
                const parts = callbackData.split('_');
                const action = parts[1]; // delivered, cancelled, returned, details
                const orderNumber = parts.slice(2).join('_');
                
                console.log(`📋 الإجراء: ${action}, رقم الطلب: ${orderNumber}`);
                
                const statusTexts = {
                    'delivered': '✅ تم التسليم',
                    'cancelled': '❌ ملغي',
                    'returned': '🔄 مرتجع',
                    'details': '📋 تفاصيل'
                };
                
                if (action === 'details') {
                    await answerCallbackQuery(callbackId, `📋 تفاصيل الطلب #${orderNumber}\nافتح لوحة التحكم في المتجر`, false);
                }
                else if (action === 'delivered' || action === 'cancelled' || action === 'returned') {
                    // إعلام المستخدم بأن التحديث جارٍ
                    await answerCallbackQuery(callbackId, `⏳ جاري تحديث الطلب #${orderNumber}...`, false);
                    
                    // تحديث الحالة في Firebase
                    const success = await updateOrderStatusInFirebase(orderNumber, action);
                    
                    if (success) {
                        // إرسال رسالة تأكيد جديدة
                        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `✅ تم تغيير حالة الطلب #${orderNumber} إلى ${statusTexts[action]}\n\n📦 الطلب: #${orderNumber}\n🕐 ${new Date().toLocaleString('ar-EG')}`,
                                parse_mode: 'HTML'
                            })
                        });
                        
                        // تحديث الرسالة الأصلية (إزالة الأزرار)
                        const newText = originalText + `\n\n━━━━━━━━━━━━━━━━━━━━\n✅ <b>تم تغيير الحالة إلى: ${statusTexts[action]}</b>`;
                        await editMessageText(chatId, messageId, newText);
                        
                        // تأكيد نهائي
                        await answerCallbackQuery(callbackId, `✅ تم تغيير حالة الطلب #${orderNumber} إلى ${statusTexts[action]}`, true);
                    } else {
                        await answerCallbackQuery(callbackId, `❌ لم يتم العثور على الطلب #${orderNumber}`, true);
                    }
                }
            }
        }
        
        res.status(200).json({ status: 'ok' });
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        res.status(200).json({ status: 'error', message: error.message });
    }
}

// دالة الرد على الضغط
async function answerCallbackQuery(callbackQueryId, text, showAlert = true) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
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

// دالة تحديث الرسالة الأصلية
async function editMessageText(chatId, messageId, newText) {
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

// دالة تحديث حالة الطلب في Firebase
async function updateOrderStatusInFirebase(orderNumber, newStatus) {
    try {
        // استيراد Firebase ديناميكياً
        const { initializeApp } = await import('firebase/app');
        const { getDatabase, ref, get, update } = await import('firebase/database');
        
        const firebaseConfig = {
            apiKey: "AIzaSyAs3U2941_rNArLPpCYjKM9yAVQtiK-oDw",
            authDomain: "nabd-store-1.firebaseapp.com",
            databaseURL: "https://nabd-store-1-default-rtdb.firebaseio.com",
            projectId: "nabd-store-1",
            storageBucket: "nabd-store-1.firebasestorage.app",
            appId: "1:132078192935:web:2d4bc9e0dfcb407b2a8102"
        };
        
        const app = initializeApp(firebaseConfig);
        const database = getDatabase(app);
        
        console.log(`🔍 البحث عن الطلب: ${orderNumber}`);
        
        // البحث في all_orders
        const allOrdersRef = ref(database, 'all_orders');
        const snapshot = await get(allOrdersRef);
        const allOrdersData = snapshot.val();
        
        if (allOrdersData) {
            for (const key in allOrdersData) {
                const order = allOrdersData[key];
                const orderNumFromDb = order.orderNumber || order.number || order.orderId || '';
                
                // تنظيف ومقارنة أرقام الطلبات
                const cleanOrderNumber = String(orderNumber).replace(/[^0-9a-zA-Z-]/g, '');
                const cleanDbNumber = String(orderNumFromDb).replace(/[^0-9a-zA-Z-]/g, '');
                
                console.log(`📋 مقارنة: "${cleanDbNumber}" مع "${cleanOrderNumber}"`);
                
                if (cleanDbNumber === cleanOrderNumber || 
                    cleanDbNumber.includes(cleanOrderNumber) || 
                    cleanOrderNumber.includes(cleanDbNumber)) {
                    
                    console.log(`✅ تم العثور على الطلب! المعرف: ${key}`);
                    console.log(`📋 الحالة الحالية: ${order.status} → جديدة: ${newStatus}`);
                    
                    await update(ref(database, `all_orders/${key}`), {
                        status: newStatus,
                        updatedAt: new Date().toISOString(),
                        updatedBy: 'telegram_bot'
                    });
                    
                    console.log(`✅ تم تحديث الحالة إلى: ${newStatus}`);
                    return true;
                }
            }
        }
        
        console.log(`❌ لم يتم العثور على الطلب: ${orderNumber}`);
        return false;
        
    } catch (error) {
        console.error('❌ خطأ في تحديث الحالة:', error);
        return false;
    }
}

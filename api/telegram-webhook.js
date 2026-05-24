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

// دالة تحديث حالة الطلب في Firebase (محسنة)
async function updateOrderStatusInFirebase(orderNumber, newStatus) {
    try {
        const { initializeApp } = await import('firebase/app');
        const { getDatabase, ref, get, update } = await import('firebase/database');
        
        const app = initializeApp(firebaseConfig);
        const database = getDatabase(app);
        
        console.log(`🔍 جاري البحث عن الطلب: "${orderNumber}"`);
        
        const statusNames = {
            'delivered': 'تم التسليم',
            'cancelled': 'ملغي',
            'returned': 'مرتجع'
        };
        
        // 1️⃣ البحث في all_orders
        const allOrdersRef = ref(database, 'all_orders');
        const snapshot = await get(allOrdersRef);
        const allOrdersData = snapshot.val();
        
        if (allOrdersData) {
            for (const key in allOrdersData) {
                const order = allOrdersData[key];
                const orderNumFromDb = order.orderNumber || order.number || order.orderId || '';
                
                console.log(`📋 مقارنة: "${orderNumFromDb}" مع "${orderNumber}"`);
                
                // مقارنة بطرق متعددة
                if (orderNumFromDb === orderNumber || 
                    orderNumFromDb.includes(orderNumber) ||
                    orderNumber.includes(orderNumFromDb) ||
                    (order.orderNumber && order.orderNumber === orderNumber) ||
                    (order.number && order.number === orderNumber)) {
                    
                    console.log(`✅ تم العثور على الطلب! المفتاح: ${key}`);
                    console.log(`📋 الحالة الحالية: ${order.status} → جديدة: ${newStatus}`);
                    
                    await update(ref(database, `all_orders/${key}`), {
                        status: newStatus,
                        updatedAt: new Date().toISOString(),
                        updatedBy: 'telegram_bot'
                    });
                    
                    console.log(`✅ تم تحديث الحالة إلى: ${newStatus}`);
                    return { success: true, order: order };
                }
            }
        }
        
        // 2️⃣ البحث في users إذا لم نجد في all_orders
        console.log('🔍 لم نجد في all_orders، نبحث في users...');
        const usersRef = ref(database, 'users');
        const usersSnapshot = await get(usersRef);
        const usersData = usersSnapshot.val();
        
        if (usersData) {
            for (const userId in usersData) {
                const ordersRef = ref(database, `users/${userId}/orders`);
                const ordersSnapshot = await get(ordersRef);
                const userOrders = ordersSnapshot.val();
                
                if (userOrders && Array.isArray(userOrders)) {
                    for (let i = 0; i < userOrders.length; i++) {
                        const order = userOrders[i];
                        const orderNumFromDb = order.orderNumber || order.number || order.orderId || '';
                        
                        if (orderNumFromDb === orderNumber || 
                            orderNumFromDb.includes(orderNumber) ||
                            orderNumber.includes(orderNumFromDb)) {
                            
                            userOrders[i].status = newStatus;
                            userOrders[i].updatedAt = new Date().toISOString();
                            await update(ref(database, `users/${userId}/orders`), userOrders);
                            console.log(`✅ تم تحديث الطلب في user ${userId}`);
                            return { success: true, order: order };
                        }
                    }
                }
            }
        }
        
        console.log(`❌ لم يتم العثور على الطلب: ${orderNumber}`);
        return { success: false, order: null };
        
    } catch (error) {
        console.error('❌ خطأ في تحديث الحالة:', error);
        return { success: false, order: null, error: error.message };
    }
}

// دالة إرسال رسالة تأكيد إلى التيليجرام بعد التحديث
async function sendConfirmationMessage(chatId, orderNumber, newStatus, oldStatus) {
    const statusTexts = {
        'delivered': '✅ تم تسليم الطلب بنجاح',
        'cancelled': '❌ تم إلغاء الطلب',
        'returned': '🔄 تم تسجيل الطلب كمرتجع'
    };
    
    const message = `📦 <b>تحديث حالة الطلب #${orderNumber}</b>\n\n` +
                    `🔄 الحالة السابقة: ${getStatusText(oldStatus)}\n` +
                    `✅ الحالة الجديدة: ${getStatusText(newStatus)}\n\n` +
                    `🕐 تم التحديث بواسطة: بوت التيليجرام\n` +
                    `📅 التاريخ: ${new Date().toLocaleString('ar-EG')}`;
    
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
        console.error('خطأ في إرسال رسالة التأكيد:', error);
    }
}

function getStatusText(status) {
    const texts = {
        'pending': '⏳ معلق',
        'delivered': '✅ تم التسليم',
        'cancelled': '❌ ملغي',
        'returned': '🔄 مرتجع'
    };
    return texts[status] || status;
}

// دالة تحديث الرسالة الأصلية (إزالة الأزرار)
async function editOriginalMessage(chatId, messageId, originalText, newStatus, orderNumber) {
    const statusTexts = {
        'delivered': '✅ تم التسليم',
        'cancelled': '❌ ملغي',
        'returned': '🔄 مرتجع'
    };
    
    const newText = originalText + `\n\n━━━━━━━━━━━━━━━━━━━━\n🔄 <b>تم تغيير الحالة إلى: ${statusTexts[newStatus]}</b>\n🕐 بواسطة: بوت التيليجرام`;
    
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
        console.error('خطأ في تحديث الرسالة:', error);
        return false;
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
        console.error('خطأ في الرد:', error);
        return false;
    }
}

// ==================== WEBHOOK HANDLER ====================
export default async function handler(req, res) {
    console.log(`📩 تم استلام طلب: ${req.method}`);
    
    if (req.method === 'GET') {
        return res.status(200).json({ 
            status: 'ok', 
            message: 'Webhook is running on Vercel!',
            time: new Date().toISOString()
        });
    }
    
    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'ok' });
    }
    
    try {
        const body = req.body;
        console.log('📦 نوع الحدث:', body.callback_query ? 'Callback Query' : 'رسالة عادية');
        
        if (body.callback_query) {
            const callback = body.callback_query;
            const callbackData = callback.data;
            const callbackId = callback.id;
            const chatId = callback.message.chat.id;
            const messageId = callback.message.message_id;
            const originalText = callback.message.text || '';
            
            console.log(`🖱️ تم الضغط على زر: ${callbackData}`);
            console.log(`💬 من المحادثة: ${chatId}`);
            
            if (callbackData.startsWith('order_')) {
                const parts = callbackData.split('_');
                const action = parts[1];
                const orderNumber = parts.slice(2).join('_');
                
                console.log(`📋 الإجراء: ${action}, رقم الطلب: "${orderNumber}"`);
                
                if (action === 'details') {
                    await answerCallbackQuery(callbackId, `📋 تفاصيل الطلب #${orderNumber}\nيمكنك رؤيتها في لوحة التحكم`, false);
                }
                else if (action === 'delivered' || action === 'cancelled' || action === 'returned') {
                    // إعلام المستخدم بأن التحديث جارٍ
                    await answerCallbackQuery(callbackId, `⏳ جاري تحديث الطلب #${orderNumber}...`, false);
                    
                    // تحديث الحالة
                    const result = await updateOrderStatusInFirebase(orderNumber, action);
                    
                    if (result.success) {
                        const statusTexts = {
                            'delivered': '✅ تم التسليم',
                            'cancelled': '❌ ملغي',
                            'returned': '🔄 مرتجع'
                        };
                        
                        // إرسال رسالة تأكيد
                        await sendConfirmationMessage(chatId, orderNumber, action, result.order?.status || 'pending');
                        
                        // تحديث الرسالة الأصلية (إزالة الأزرار)
                        await editOriginalMessage(chatId, messageId, originalText, action, orderNumber);
                        
                        // إشعار بنجاح التحديث
                        await answerCallbackQuery(callbackId, `✅ تم تغيير حالة الطلب #${orderNumber} إلى: ${statusTexts[action]}`, true);
                        
                        console.log(`🎉 تم تحديث الطلب ${orderNumber} بنجاح!`);
                    } else {
                        await answerCallbackQuery(callbackId, `❌ لم يتم العثور على الطلب #${orderNumber}\nتأكد من رقم الطلب وحاول مرة أخرى`, true);
                        console.log(`❌ فشل تحديث الطلب ${orderNumber}`);
                    }
                }
            }
        }
        
        res.status(200).json({ status: 'ok' });
        
    } catch (error) {
        console.error('❌ خطأ فادح:', error);
        res.status(200).json({ status: 'error', message: error.message });
    }
}

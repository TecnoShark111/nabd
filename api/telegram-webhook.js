// api/telegram-webhook.js

const TELEGRAM_BOT_TOKEN = '8931293118:AAHT6Ws1-_QPMQ4YxPExzf9CzHtTOjcJmtE';

// Firebase Admin SDK import (طريقة مختلفة لـ Vercel)
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get, update } = require('firebase/database');

const firebaseConfig = {
    apiKey: "AIzaSyAs3U2941_rNArLPpCYjKM9yAVQtiK-oDw",
    authDomain: "nabd-store-1.firebaseapp.com",
    databaseURL: "https://nabd-store-1-default-rtdb.firebaseio.com",
    projectId: "nabd-store-1",
    storageBucket: "nabd-store-1.firebasestorage.app",
    appId: "1:132078192935:web:2d4bc9e0dfcb407b2a8102"
};

// تهيئة Firebase مرة واحدة فقط
let app = null;
let database = null;

function getFirebase() {
    if (!app) {
        app = initializeApp(firebaseConfig);
        database = getDatabase(app);
    }
    return { database };
}

// دالة تحديث حالة الطلب
async function updateOrderStatus(orderNumber, newStatus) {
    const { database } = getFirebase();
    
    try {
        console.log(`🔍 جاري البحث عن الطلب: ${orderNumber}`);
        
        const allOrdersRef = ref(database, 'all_orders');
        const snapshot = await get(allOrdersRef);
        const allOrdersData = snapshot.val();
        
        if (!allOrdersData) {
            console.log('❌ لا توجد طلبات في all_orders');
            return false;
        }
        
        let found = false;
        for (const key in allOrdersData) {
            const order = allOrdersData[key];
            // مقارنة بعدة طرق للعثور على الطلب
            if (order.orderNumber === orderNumber || 
                order.number === orderNumber || 
                order.orderId === orderNumber ||
                (order.orderNumber && order.orderNumber.includes(orderNumber)) ||
                (order.orderId && order.orderId.includes(orderNumber))) {
                
                console.log(`✅ تم العثور على الطلب: ${key}, الحالة الحالية: ${order.status}`);
                
                await update(ref(database, `all_orders/${key}`), {
                    status: newStatus,
                    updatedAt: new Date().toISOString(),
                    updatedBy: 'telegram_bot'
                });
                
                console.log(`✅ تم تحديث الحالة إلى: ${newStatus}`);
                found = true;
                break;
            }
        }
        
        // إذا لم نجد الطلب في all_orders، نبحث في مسار المستخدمين
        if (!found) {
            console.log('🔍 لم نجد الطلب في all_orders، نبحث في users...');
            const usersRef = ref(database, 'users');
            const usersSnapshot = await get(usersRef);
            const usersData = usersSnapshot.val();
            
            if (usersData) {
                for (const userId in usersData) {
                    const ordersRef = ref(database, `users/${userId}/orders`);
                    const ordersSnapshot = await get(ordersRef);
                    const userOrders = ordersSnapshot.val();
                    
                    if (userOrders && Array.isArray(userOrders)) {
                        const orderIndex = userOrders.findIndex(o => 
                            o.orderNumber === orderNumber || 
                            o.number === orderNumber || 
                            o.orderId === orderNumber
                        );
                        
                        if (orderIndex !== -1) {
                            userOrders[orderIndex].status = newStatus;
                            userOrders[orderIndex].updatedAt = new Date().toISOString();
                            await update(ref(database, `users/${userId}/orders`), userOrders);
                            console.log(`✅ تم تحديث الطلب في user ${userId}`);
                            found = true;
                            break;
                        }
                    }
                }
            }
        }
        
        return found;
        
    } catch (error) {
        console.error('❌ خطأ في تحديث الحالة:', error);
        return false;
    }
}

// دالة الرد على الضغط
async function answerCallbackQuery(callbackQueryId, text, showAlert = false) {
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
        const result = await response.json();
        console.log('📤 رد على الضغط:', result);
        return result.ok;
    } catch (error) {
        console.error('❌ خطأ في الرد:', error);
        return false;
    }
}

// دالة تحديث رسالة المستخدم (إزالة الأزرار بعد الضغط)
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
        console.error('❌ خطأ في تحديث الرسالة:', error);
        return false;
    }
}

// Webhook handler
export default async function handler(req, res) {
    console.log('📩 تم استلام طلب Webhook:', req.method);
    
    // السماح بـ GET للاختبار
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'ok', message: 'Webhook is running' });
    }
    
    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'ok' });
    }
    
    try {
        const body = req.body;
        console.log('📦 محتوى الطلب:', JSON.stringify(body, null, 2));
        
        // معالجة الضغط على الأزرار
        if (body.callback_query) {
            const callback = body.callback_query;
            const callbackData = callback.data;
            const callbackId = callback.id;
            const chatId = callback.message.chat.id;
            const messageId = callback.message.message_id;
            const originalText = callback.message.text;
            
            console.log(`🖱️ تم الضغط على زر: ${callbackData} من المحادثة ${chatId}`);
            
            if (callbackData.startsWith('order_')) {
                const parts = callbackData.split('_');
                const action = parts[1];
                // استخراج رقم الطلب (قد يحتوي على _)
                const orderNumber = parts.slice(2).join('_');
                
                console.log(`📋 الإجراء: ${action}, رقم الطلب: ${orderNumber}`);
                
                if (action === 'details') {
                    await answerCallbackQuery(callbackId, `📋 تفاصيل الطلب #${orderNumber}\nيمكنك رؤيتها في لوحة التحكم بالمتصفح`, false);
                }
                else if (action === 'delivered') {
                    await answerCallbackQuery(callbackId, `⏳ جاري تحديث الطلب #${orderNumber}...`, false);
                    const success = await updateOrderStatus(orderNumber, 'delivered');
                    
                    if (success) {
                        await answerCallbackQuery(callbackId, `✅ تم تغيير حالة الطلب #${orderNumber} إلى: تم التسليم`, true);
                        // تحديث الرسالة لإزالة الأزرار
                        const newText = originalText + `\n\n━━━━━━━━━━━━━━━━━━━━\n✅ <b>تم تغيير الحالة إلى: تم التسليم</b>`;
                        await editMessageText(chatId, messageId, newText);
                    } else {
                        await answerCallbackQuery(callbackId, `❌ لم يتم العثور على الطلب #${orderNumber}`, true);
                    }
                }
                else if (action === 'cancelled') {
                    await answerCallbackQuery(callbackId, `⏳ جاري تحديث الطلب #${orderNumber}...`, false);
                    const success = await updateOrderStatus(orderNumber, 'cancelled');
                    
                    if (success) {
                        await answerCallbackQuery(callbackId, `❌ تم تغيير حالة الطلب #${orderNumber} إلى: ملغي`, true);
                        const newText = originalText + `\n\n━━━━━━━━━━━━━━━━━━━━\n❌ <b>تم تغيير الحالة إلى: ملغي</b>`;
                        await editMessageText(chatId, messageId, newText);
                    } else {
                        await answerCallbackQuery(callbackId, `❌ لم يتم العثور على الطلب #${orderNumber}`, true);
                    }
                }
                else if (action === 'returned') {
                    await answerCallbackQuery(callbackId, `⏳ جاري تحديث الطلب #${orderNumber}...`, false);
                    const success = await updateOrderStatus(orderNumber, 'returned');
                    
                    if (success) {
                        await answerCallbackQuery(callbackId, `🔄 تم تغيير حالة الطلب #${orderNumber} إلى: مرتجع`, true);
                        const newText = originalText + `\n\n━━━━━━━━━━━━━━━━━━━━\n🔄 <b>تم تغيير الحالة إلى: مرتجع</b>`;
                        await editMessageText(chatId, messageId, newText);
                    } else {
                        await answerCallbackQuery(callbackId, `❌ لم يتم العثور على الطلب #${orderNumber}`, true);
                    }
                }
            }
        }
        
        res.status(200).json({ status: 'ok' });
        
    } catch (error) {
        console.error('❌ خطأ فادح في Webhook:', error);
        res.status(200).json({ status: 'error', message: error.message });
    }
}

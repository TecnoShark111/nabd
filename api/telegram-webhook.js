// api/telegram-webhook.js

const TELEGRAM_BOT_TOKEN = '8931293118:AAHT6Ws1-_QPMQ4YxPExzf9CzHtTOjcJmtE';

// Firebase configuration
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

let app = null;
let database = null;

function getFirebase() {
    if (!app) {
        app = initializeApp(firebaseConfig);
        database = getDatabase(app);
    }
    return { database };
}

// MAIN HANDLER
export default async function handler(req, res) {
    // السماح بـ GET للاختبار
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
        
        // 🔥 سجل محتوى الطلب كاملاً (مهم جداً للمعرفة)
        console.log('📦 FULL BODY:', JSON.stringify(body, null, 2));
        
        // معالجة الضغط على الأزرار
        if (body.callback_query) {
            const callback = body.callback_query;
            const callbackData = callback.data;
            const callbackId = callback.id;
            
            console.log(`🖱️ BUTTON PRESSED: ${callbackData}`);
            
            // رد بسيط للتأكيد أن البوت استقبل الضغط
            await answerCallbackQuery(callbackId, `✅ تم استلام طلبك: ${callbackData}`, false);
            
            if (callbackData.startsWith('order_')) {
                const parts = callbackData.split('_');
                const action = parts[1];
                const orderNumber = parts.slice(2).join('_');
                
                console.log(`📋 Action: ${action}, Order: ${orderNumber}`);
                
                // تحديث الحالة
                const success = await updateOrderStatus(orderNumber, action);
                
                if (success) {
                    console.log(`✅ Order ${orderNumber} updated to ${action}`);
                    await answerCallbackQuery(callbackId, `✅ تم تحديث الطلب #${orderNumber}`, true);
                } else {
                    console.log(`❌ Order ${orderNumber} not found`);
                    await answerCallbackQuery(callbackId, `❌ لم نجد الطلب #${orderNumber}`, true);
                }
            }
        }
        
        res.status(200).json({ status: 'ok' });
        
    } catch (error) {
        console.error('❌ ERROR:', error);
        res.status(200).json({ status: 'error', message: error.message });
    }
}

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
        return await response.json();
    } catch (error) {
        console.error('AnswerCallback error:', error);
        return false;
    }
}

async function updateOrderStatus(orderNumber, newStatus) {
    const { database } = getFirebase();
    
    try {
        console.log(`🔍 Searching for order: ${orderNumber}`);
        
        // تحويل status إلى الصيغة الصحيحة
        let finalStatus = newStatus;
        if (newStatus === 'delivered') finalStatus = 'delivered';
        else if (newStatus === 'cancelled') finalStatus = 'cancelled';
        else if (newStatus === 'returned') finalStatus = 'returned';
        
        const allOrdersRef = ref(database, 'all_orders');
        const snapshot = await get(allOrdersRef);
        const allOrdersData = snapshot.val();
        
        if (!allOrdersData) {
            console.log('❌ No orders found');
            return false;
        }
        
        for (const key in allOrdersData) {
            const order = allOrdersData[key];
            // مقارنة بعدة طرق
            if (order.orderNumber === orderNumber || 
                order.number === orderNumber || 
                order.orderId === orderNumber) {
                
                console.log(`✅ Found order: ${key}, current status: ${order.status}`);
                
                await update(ref(database, `all_orders/${key}`), {
                    status: finalStatus,
                    updatedAt: new Date().toISOString(),
                    updatedBy: 'telegram_bot'
                });
                
                console.log(`✅ Status updated to: ${finalStatus}`);
                return true;
            }
        }
        
        console.log(`❌ Order ${orderNumber} not found in all_orders`);
        return false;
        
    } catch (error) {
        console.error('Update error:', error);
        return false;
    }
}

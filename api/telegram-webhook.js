// api/telegram-webhook.js

const TELEGRAM_BOT_TOKEN = '8931293118:AAHT6Ws1-_QPMQ4YxPExzf9CzHtTOjcJmtE';

async function updateOrderStatus(orderNumber, newStatus) {
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
    
    try {
        const allOrdersRef = ref(database, 'all_orders');
        const snapshot = await get(allOrdersRef);
        const allOrdersData = snapshot.val();
        
        if (allOrdersData) {
            for (const key in allOrdersData) {
                const order = allOrdersData[key];
                if (order.orderNumber === orderNumber || order.number === orderNumber || order.orderId === orderNumber) {
                    await update(ref(database, `all_orders/${key}`), {
                        status: newStatus,
                        updatedAt: new Date().toISOString(),
                        updatedBy: 'telegram_bot'
                    });
                    return true;
                }
            }
        }
        return false;
    } catch (error) {
        console.error('خطأ:', error);
        return false;
    }
}

async function answerCallbackQuery(callbackQueryId, text) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            callback_query_id: callbackQueryId,
            text: text,
            show_alert: false
        })
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'ok' });
    }
    
    try {
        const body = req.body;
        
        if (body.callback_query) {
            const callback = body.callback_query;
            const callbackData = callback.data;
            const callbackId = callback.id;
            
            if (callbackData.startsWith('order_')) {
                const parts = callbackData.split('_');
                const status = parts[1];
                const orderNumber = parts.slice(2).join('_');
                
                if (status === 'details') {
                    await answerCallbackQuery(callbackId, `📋 تفاصيل الطلب #${orderNumber}\nيمكنك رؤيتها في لوحة التحكم`);
                } else {
                    const statusNames = {
                        'delivered': '✅ تم التسليم',
                        'cancelled': '❌ ملغي',
                        'returned': '🔄 مرتجع'
                    };
                    
                    const success = await updateOrderStatus(orderNumber, status);
                    
                    if (success) {
                        await answerCallbackQuery(callbackId, `✅ تم تغيير حالة الطلب #${orderNumber} إلى ${statusNames[status]}`);
                    } else {
                        await answerCallbackQuery(callbackId, `❌ لم يتم العثور على الطلب #${orderNumber}`);
                    }
                }
            }
        }
        
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('خطأ:', error);
        res.status(200).json({ status: 'error' });
    }
}
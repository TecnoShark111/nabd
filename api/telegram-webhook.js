// api/telegram-webhook.js

const TELEGRAM_BOT_TOKEN = '8931293118:AAHT6Ws1-_QPMQ4YxPExzf9CzHtTOjcJmtE';

export default async function handler(req, res) {
    // اختبار أن الويب هوك يعمل
    if (req.method === 'GET') {
        return res.status(200).json({ status: 'ok', message: 'Webhook is running!' });
    }
    
    if (req.method !== 'POST') {
        return res.status(200).json({ status: 'ok' });
    }
    
    try {
        const body = req.body;
        
        // عند الضغط على زر في تيليجرام
        if (body.callback_query) {
            const callback = body.callback_query;
            const callbackData = callback.data;
            const callbackId = callback.id;
            
            console.log('✅ تم الضغط على زر:', callbackData);
            
            // رد فوري بأن البوت استلم الطلب
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callback_query_id: callbackId,
                    text: '✅ جاري تحديث الطلب...',
                    show_alert: false
                })
            });
            
            // استخراج البيانات من الزر
            if (callbackData.startsWith('order_')) {
                const parts = callbackData.split('_');
                const action = parts[1]; // delivered, cancelled, returned
                const orderNumber = parts.slice(2).join('_');
                
                console.log(`📋 الأمر: ${action}, رقم الطلب: ${orderNumber}`);
                
                // تحديث الحالة في Firebase (طريقة مبسطة)
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
                
                // البحث عن الطلب وتحديثه
                const allOrdersRef = ref(database, 'all_orders');
                const snapshot = await get(allOrdersRef);
                const orders = snapshot.val();
                
                let found = false;
                if (orders) {
                    for (const key in orders) {
                        const order = orders[key];
                        const orderNum = order.orderNumber || order.number || order.orderId || '';
                        
                        if (orderNum === orderNumber || orderNum.includes(orderNumber) || orderNumber.includes(orderNum)) {
                            await update(ref(database, `all_orders/${key}`), {
                                status: action,
                                updatedAt: new Date().toISOString(),
                                updatedBy: 'telegram_bot'
                            });
                            found = true;
                            console.log(`✅ تم تحديث الطلب ${orderNumber} إلى ${action}`);
                            break;
                        }
                    }
                }
                
                // إرسال رسالة تأكيد
                const statusTexts = {
                    'delivered': '✅ تم التسليم',
                    'cancelled': '❌ ملغي',
                    'returned': '🔄 مرتجع'
                };
                
                const confirmMessage = found 
                    ? `✅ تم تغيير حالة الطلب #${orderNumber} إلى ${statusTexts[action]}`
                    : `❌ لم يتم العثور على الطلب #${orderNumber}`;
                
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callback_query_id: callbackId,
                        text: confirmMessage,
                        show_alert: true
                    })
                });
                
                // إرسال رسالة منفصلة للتأكيد
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: callback.message.chat.id,
                        text: confirmMessage + `\n\n📦 الطلب: #${orderNumber}\n🕐 ${new Date().toLocaleString('ar-EG')}`,
                        parse_mode: 'HTML'
                    })
                });
            }
        }
        
        res.status(200).json({ status: 'ok' });
        
    } catch (error) {
        console.error('خطأ:', error);
        res.status(200).json({ status: 'error' });
    }
}

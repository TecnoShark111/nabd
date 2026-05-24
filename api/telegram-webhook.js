// api/telegram-webhook.js
// ✅ هذا الكود يعمل على Vercel

const TELEGRAM_BOT_TOKEN = '8931293118:AAHT6Ws1-_QPMQ4YxPExzf9CzHtTOjcJmtE';

// إعدادات Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAs3U2941_rNArLPpCYjKM9yAVQtiK-oDw",
    authDomain: "nabd-store-1.firebaseapp.com",
    databaseURL: "https://nabd-store-1-default-rtdb.firebaseio.com",
    projectId: "nabd-store-1",
    storageBucket: "nabd-store-1.firebasestorage.app",
    appId: "1:132078192935:web:2d4bc9e0dfcb407b2a8102"
};

// دالة تحديث حالة الطلب في Firebase
async function updateOrderStatusInFirebase(orderNumber, newStatus) {
    try {
        // ديناميكياً استيراد Firebase (لـ ES Modules)
        const { initializeApp } = await import('firebase/app');
        const { getDatabase, ref, get, update } = await import('firebase/database');
        
        const app = initializeApp(firebaseConfig);
        const database = getDatabase(app);
        
        console.log(`🔍 جاري البحث عن الطلب: ${orderNumber}`);
        
        // البحث في all_orders
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
                (order.orderNumber && order.orderNumber.includes(orderNumber))) {
                
                console.log(`✅ تم العثور على الطلب: ${key}`);
                console.log(`📋 الحالة الحالية: ${order.status} → جديدة: ${newStatus}`);
                
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
        
        // إذا لم نجد في all_orders، نبحث في users
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
        const result = await response.json();
        console.log('📤 رد على الضغط:', result);
        return result.ok;
    } catch (error) {
        console.error('❌ خطأ في الرد:', error);
        return false;
    }
}

// ==================== WEBHOOK HANDLER ====================
export default async function handler(req, res) {
    console.log(`📩 تم استلام طلب: ${req.method}`);
    
    // للاختبار - GET request
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
        console.log('📦 محتوى الطلب:', JSON.stringify(body, null, 2));
        
        // معالجة الضغط على الأزرار
        if (body.callback_query) {
            const callback = body.callback_query;
            const callbackData = callback.data;
            const callbackId = callback.id;
            const messageText = callback.message?.text || '';
            
            console.log(`🖱️ تم الضغط على زر: ${callbackData}`);
            
            if (callbackData.startsWith('order_')) {
                const parts = callbackData.split('_');
                const action = parts[1]; // delivered, cancelled, returned, details
                const orderNumber = parts.slice(2).join('_');
                
                console.log(`📋 الإجراء: ${action}, رقم الطلب: ${orderNumber}`);
                
                if (action === 'details') {
                    await answerCallbackQuery(callbackId, `📋 تفاصيل الطلب #${orderNumber}\nيمكنك رؤيتها في لوحة التحكم بالمتصفح`, false);
                }
                else if (action === 'delivered') {
                    await answerCallbackQuery(callbackId, `⏳ جاري تحديث الطلب #${orderNumber}...`, false);
                    const success = await updateOrderStatusInFirebase(orderNumber, 'delivered');
                    
                    if (success) {
                        await answerCallbackQuery(callbackId, `✅ تم تغيير حالة الطلب #${orderNumber} إلى: تم التسليم`, true);
                    } else {
                        await answerCallbackQuery(callbackId, `❌ لم يتم العثور على الطلب #${orderNumber}`, true);
                    }
                }
                else if (action === 'cancelled') {
                    await answerCallbackQuery(callbackId, `⏳ جاري تحديث الطلب #${orderNumber}...`, false);
                    const success = await updateOrderStatusInFirebase(orderNumber, 'cancelled');
                    
                    if (success) {
                        await answerCallbackQuery(callbackId, `❌ تم تغيير حالة الطلب #${orderNumber} إلى: ملغي`, true);
                    } else {
                        await answerCallbackQuery(callbackId, `❌ لم يتم العثور على الطلب #${orderNumber}`, true);
                    }
                }
                else if (action === 'returned') {
                    await answerCallbackQuery(callbackId, `⏳ جاري تحديث الطلب #${orderNumber}...`, false);
                    const success = await updateOrderStatusInFirebase(orderNumber, 'returned');
                    
                    if (success) {
                        await answerCallbackQuery(callbackId, `🔄 تم تغيير حالة الطلب #${orderNumber} إلى: مرتجع`, true);
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

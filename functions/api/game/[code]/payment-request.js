// POST /api/game/:code/payment-request — Create or respond to a payment request (Request to Pay)
export async function onRequestPost({ params, request, env }) {
  try {
    const code = params.code.toUpperCase();

    const game = await env.DB.prepare(
      `SELECT id, round FROM games WHERE room_code = ? AND active = 1`
    ).bind(code).first();

    if (!game) return json({ error: 'ไม่พบห้องเกม' }, 404);

    const body = await request.json();
    const action = body.action || 'request';

    // ====================================================
    // ACTION 1: REQUEST TO PAY (เจ้าหนี้ทวงเงิน/เรียกเก็บเงิน)
    // ====================================================
    if (action === 'request') {
      const fromPlayerId = parseInt(body.debtorId || body.fromPlayerId || body.targetPlayerId); // ผู้ต้องจ่าย (ลูกหนี้)
      const toPlayerId = parseInt(body.creditorId || body.toPlayerId || body.requesterId);     // ผู้ขอเรียกเก็บ (เจ้าหนี้)
      const amount = parseInt(body.amount);
      const reason = (body.reason || 'เรียกเก็บเงิน').trim();

      if (!fromPlayerId || !toPlayerId) {
        return json({ error: 'ข้อมูลผู้เล่นไม่ถูกต้อง' }, 400);
      }
      if (fromPlayerId === toPlayerId) {
        return json({ error: 'ไม่สามารถเรียกเก็บเงินจากตัวเองได้' }, 400);
      }
      if (!amount || amount <= 0) {
        return json({ error: 'จำนวนเงินต้องมากกว่า 0' }, 400);
      }

      const debtor = await env.DB.prepare(
        `SELECT id, name, bankrupt FROM players WHERE id = ? AND game_id = ?`
      ).bind(fromPlayerId, game.id).first();

      const creditor = await env.DB.prepare(
        `SELECT id, name, bankrupt FROM players WHERE id = ? AND game_id = ?`
      ).bind(toPlayerId, game.id).first();

      if (!debtor || !creditor) {
        return json({ error: 'ไม่พบผู้เล่นในห้องนี้' }, 404);
      }
      if (debtor.bankrupt) {
        return json({ error: `${debtor.name} ล้มละลายแล้ว ไม่สามารถเรียกเก็บเงินได้` }, 400);
      }

      // Insert pending payment request
      const reqRes = await env.DB.prepare(`
        INSERT INTO payment_requests (game_id, from_player_id, to_player_id, amount, reason, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).bind(game.id, fromPlayerId, toPlayerId, amount, reason).run();

      // Insert notification in transaction log
      await env.DB.prepare(`
        INSERT INTO transactions (game_id, type, icon, from_label, to_label, amount, reason, round)
        VALUES (?, 'system', '🔔', ?, ?, ?, ?, ?)
      `).bind(
        game.id,
        creditor.name,
        debtor.name,
        amount,
        `ส่งคำขอเรียกเก็บเงิน ฿${Number(amount).toLocaleString('th-TH')} (เหตุผล: ${reason})`,
        game.round
      ).run();

      return json({
        success: true,
        message: `ส่งคำขอเรียกเก็บเงินไปยัง ${debtor.name} แล้ว`,
        requestId: reqRes.meta?.last_row_id
      });
    }

    // ====================================================
    // ACTION 2: RESPOND TO REQUEST (ลูกหนี้ ยินยอมจ่าย หรือ ปฏิเสธ)
    // ====================================================
    if (action === 'respond') {
      const requestId = parseInt(body.requestId);
      const decision = body.decision; // 'accept' | 'reject'
      const playerId = parseInt(body.playerId);

      if (!requestId || !['accept', 'reject'].includes(decision)) {
        return json({ error: 'คำขอไม่ถูกต้อง' }, 400);
      }

      const pReq = await env.DB.prepare(`
        SELECT pr.*, p_from.name as from_name, p_from.balance as from_balance, p_to.name as to_name
        FROM payment_requests pr
        JOIN players p_from ON p_from.id = pr.from_player_id
        JOIN players p_to ON p_to.id = pr.to_player_id
        WHERE pr.id = ? AND pr.game_id = ?
      `).bind(requestId, game.id).first();

      if (!pReq) return json({ error: 'ไม่พบรายการเรียกเก็บเงิน' }, 404);
      if (pReq.status !== 'pending') {
        return json({ error: 'รายการนี้ได้รับการตอบรับหรือปฏิเสธไปแล้ว' }, 400);
      }
      if (playerId && pReq.from_player_id !== playerId) {
        return json({ error: 'คุณไม่ใช่ผู้ที่ถูกเรียกเก็บเงินรายการนี้' }, 403);
      }

      // If rejected
      if (decision === 'reject') {
        await env.DB.prepare(
          `UPDATE payment_requests SET status = 'rejected' WHERE id = ?`
        ).bind(requestId).run();

        await env.DB.prepare(`
          INSERT INTO transactions (game_id, type, icon, from_label, to_label, amount, reason, round)
          VALUES (?, 'system', '❌', ?, ?, ?, ?, ?)
        `).bind(
          game.id,
          pReq.from_name,
          pReq.to_name,
          pReq.amount,
          `ปฏิเสธคำขอเรียกเก็บเงิน ฿${Number(pReq.amount).toLocaleString('th-TH')} (เหตุผลเดิม: ${pReq.reason})`,
          game.round
        ).run();

        return json({
          success: true,
          status: 'rejected',
          message: 'ปฏิเสธคำขอเรียกเก็บเงินแล้ว'
        });
      }

      // If accepted -> Transfer the money
      const amount = pReq.amount;

      // Transfer balances
      await env.DB.prepare(
        `UPDATE players SET balance = balance - ? WHERE id = ?`
      ).bind(amount, pReq.from_player_id).run();

      await env.DB.prepare(
        `UPDATE players SET balance = balance + ? WHERE id = ?`
      ).bind(amount, pReq.to_player_id).run();

      await env.DB.prepare(
        `UPDATE payment_requests SET status = 'accepted' WHERE id = ?`
      ).bind(requestId).run();

      const finalReason = `${pReq.reason || 'ชำระเงิน'} (ตามคำขอ)`;

      await env.DB.prepare(`
        INSERT INTO transactions (game_id, type, icon, from_label, to_label, amount, reason, round)
        VALUES (?, 'transfer', '💸', ?, ?, ?, ?, ?)
      `).bind(
        game.id,
        pReq.from_name,
        pReq.to_name,
        amount,
        finalReason,
        game.round
      ).run();

      const refNo = 'RQ' + Date.now().toString().slice(-8);

      return json({
        success: true,
        status: 'accepted',
        refNo,
        amount,
        fromName: pReq.from_name,
        toName: pReq.to_name,
        reason: finalReason,
        timestamp: new Date().toISOString()
      });
    }

    return json({ error: 'Unknown action' }, 400);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Content-Type': 'application/json' } });
}

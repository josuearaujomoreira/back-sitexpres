// controllers/paypalController.js
import client from './paypal.js';
import checkoutNodeJssdk from '@paypal/checkout-server-sdk';
import fetch from 'node-fetch';
import 'dotenv/config';
import pool from "../config/db.js";
import fs from 'fs/promises';
import path from 'path';

// ==================== FUNÇÕES AUXILIARES ====================

async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch(
    `${process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com'}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    }
  );

  const data = await response.json();
  return data.access_token;
}

// ==================== PAGAMENTO ÚNICO ====================

export async function createOrder(req, res) {
  try {
    const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
    request.prefer("return=representation");

    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "BRL",
            value: "0.5" // req.body.value || "29.90"
          },
          description: req.body.description || "Pagamento SitExpres"
        }
      ],
      application_context: {
        brand_name: "sitexpres.com.br",
        landing_page: "BILLING",
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: "https://back.sitexpres.com.br/api/paypal/pagamento/sucesso",
        cancel_url: "https://back.sitexpres.com.br/api/paypal/pagamento/cancelado"
      }
    });

    const response = await client.execute(request);

    //console.log(response.result)

    //---- inserindo transando no banco como pendente

    var qtd_credito = req.body.qtd_creditos || 10;
    var valor = req.body.value || "29.90";
    var typePayment = req.body.tipoPagamento || 'PayPall';
    var Payment_id = response.result.id || "29.90";
    var ID_user = req.body.userid || "00";
    var Url_Pagamento = response.result.links.find(l => l.rel === "approve")?.href || 'Sem URL';


    pool.query(
      `
      INSERT INTO public.transactions (
          user_id,
          type,
          status,
          description,
          credits,
          monetary_value,
          payment_method,
          payment_id,
          url_payment,
          value
        ) VALUES (
          $1,
          'purchase_credits',
          'pending',
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
      `,
      [
        ID_user,
        `Compra de ${qtd_credito} créditos`,
        qtd_credito,
        valor,
        typePayment,
        Payment_id,
        Url_Pagamento,
        valor
      ]
    );


    return res.json({
      id: response.result.id,
      approve: response.result.links.find(l => l.rel === "approve")?.href
    });

  } catch (err) {
    console.error("ERRO PAYPAL ORDER:", err.response?.result || err);
    return res.status(500).json({
      error: "Erro ao criar pedido",
      details: err.response?.result || err.message
    });
  }
}

export async function captureOrder(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: "Token não fornecido" });
    }

    const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(token);
    request.requestBody({});

    const response = await client.execute(request);

    console.log("✅ Pagamento aprovado:", response.result.id);

    // Aqui você pode salvar no banco de dados
    const paymentData = {
      order_id: response.result.id,
      status: response.result.status,
      payer_email: response.result.payer?.email_address,
      amount: response.result.purchase_units[0].amount.value,
      currency: response.result.purchase_units[0].amount.currency_code
    };

    return res.json({
      success: true,
      payment: paymentData
    });

  } catch (err) {
    console.error("ERRO AO CAPTURAR:", err);
    return res.status(500).json({
      error: "Erro ao capturar pagamento",
      details: err.message
    });
  }
}

export async function paymentSuccess(req, res) {
  try {
    const { token } = req.query;

    console.log("✅ Pagamento concluído! Order ID:", token);

    //consultado no banco se existe token para o pagamento
    const payment = await pool.query(
      `SELECT * FROM public.transactions where payment_id = $1`,
      [token]
    );

    if (payment.rows.length === 0) {
      console.error("Pagamento não encontrado para o token:", token);
      return res.status(404).send("Pagamento não encontrado");
    } else {

      // Check if transaction is pending before adding credits
      if (payment.rows[0].status === 'pending') {
        console.log('Pagamento pendente, adicionando créditos ao usuário');
        //Atualizando o usuario
        await pool.query(
          `UPDATE public.users SET credits = credits + $1 WHERE id = $2`,
          [payment.rows[0].credits, payment.rows[0].user_id]
        );

        //Fazendo Update no pagamento
        await pool.query(
          `UPDATE public.transactions SET status = 'completed' WHERE payment_id = $1`,
          [token]
        );

      } else {
        console.log(`Pagamento ${token} já processado anteriormente. Status atual: ${payment.rows[0].status}`);
      }
    }

    // Redirecionar para frontend
    return res.redirect(`https://sitexpres.com.br/sucesso?order=${token}`);

  } catch (err) {
    console.error("ERRO:", err);
    return res.status(500).send("Erro ao processar pagamento");
  }
}

export async function paymentCancel(req, res) {
  console.log("❌ Pagamento cancelado pelo usuário");
  return res.redirect('https://sitexpres.com.br/cancelado');
}

// ==================== ASSINATURAS - SETUP (EXECUTAR 1 VEZ) ====================

export async function createProduct(req, res) {
  try {
    const token = await getAccessToken();

    const productData = {
      name: req.body.name || "SitExpres Premium",
      description: req.body.description || "Acesso à plataforma SitExpres",
      type: "SERVICE",
      category: "SOFTWARE",
      image_url: req.body.image_url || "https://sitexpres.com.br/logo.png",
      home_url: "https://sitexpres.com.br"
    };

    const response = await fetch(
      `${process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com'}/v1/catalogs/products`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productData)
      }
    );

    const product = await response.json();

    if (product.error || product.name === 'INVALID_REQUEST') {
      console.error("ERRO AO CRIAR PRODUTO:", product);
      return res.status(400).json({
        error: product.message || "Erro ao criar produto",
        details: product.details || product
      });
    }

    console.log("✅ Produto criado:", product.id);

    return res.json({
      product_id: product.id,
      name: product.name,
      message: "⚠️ IMPORTANTE: Guarde este product_id no seu .env como PAYPAL_PRODUCT_ID"
    });

  } catch (err) {
    console.error("ERRO:", err);
    return res.status(500).json({
      error: "Erro ao criar produto",
      details: err.message
    });
  }
}

export async function createSubscriptionPlan(req, res) {
  try {
    const token = await getAccessToken();

    if (!process.env.PAYPAL_PRODUCT_ID) {
      return res.status(400).json({
        error: "PAYPAL_PRODUCT_ID não configurado no .env. Execute /setup/produto primeiro."
      });
    }

    const planData = {
      product_id: process.env.PAYPAL_PRODUCT_ID,
      name: req.body.name || "Plano Mensal SitExpres",
      description: req.body.description || "Assinatura mensal da plataforma",
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: {
            interval_unit: req.body.interval_unit || "MONTH",
            interval_count: req.body.interval_count || 1
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: req.body.total_cycles || 0, // 0 = infinito
          pricing_scheme: {
            fixed_price: {
              value: req.body.value || "49.90",
              currency_code: "BRL"
            }
          }
        }
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
        setup_fee: {
          value: "0",
          currency_code: "BRL"
        }
      },
      taxes: {
        inclusive: false
      }
    };

    const response = await fetch(
      `${process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com'}/v1/billing/plans`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(planData)
      }
    );

    const plan = await response.json();

    if (plan.error || plan.name === 'INVALID_REQUEST') {
      console.error("ERRO AO CRIAR PLANO:", plan);
      return res.status(400).json({
        error: plan.message || "Erro ao criar plano",
        details: plan.details || plan
      });
    }

    console.log("✅ Plano criado:", plan.id);

    return res.json({
      plan_id: plan.id,
      name: plan.name,
      price: plan.billing_cycles[0].pricing_scheme.fixed_price.value,
      message: "⚠️ IMPORTANTE: Guarde este plan_id no seu .env como PAYPAL_PLAN_ID"
    });

  } catch (err) {
    console.error("ERRO:", err);
    return res.status(500).json({
      error: "Erro ao criar plano",
      details: err.message
    });
  }
}

// ==================== ASSINATURAS - USO NORMAL ====================

export async function createSubscription(req, res) {
  try {
    const token = await getAccessToken();
    const { email, name, surname } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email é obrigatório" });
    }

    if (!process.env.PAYPAL_PLAN_ID) {
      return res.status(400).json({
        error: "PAYPAL_PLAN_ID não configurado no .env. Execute /setup/plano primeiro."
      });
    }

    const subscriptionData = {
      plan_id: process.env.PAYPAL_PLAN_ID,

      subscriber: {
        email_address: email,
        name: {
          given_name: name || "Cliente",
          surname: surname || "SitExpres"
        }
      },

      application_context: {
        brand_name: "sitexpres.com.br",
        //locale: "pt_BR",
        landing_page: "BILLING", // Força tela de cartão
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        payment_method: {
          payer_selected: "PAYPAL",
          payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED"
        },
        return_url: "https://back.sitexpres.com.br/api/paypal/assinatura/sucesso",
        cancel_url: "https://back.sitexpres.com.br/api/paypal/assinatura/cancelado"
      }
    };

    const response = await fetch(
      `${process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com'}/v1/billing/subscriptions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'PayPal-Request-Id': `SUB-${Date.now()}`
        },
        body: JSON.stringify(subscriptionData)
      }
    );

    const subscription = await response.json();

    if (subscription.name === 'INVALID_REQUEST' || subscription.error) {
      console.error("ERRO PAYPAL:", subscription);
      return res.status(400).json({
        error: subscription.message || "Erro ao criar assinatura",
        details: subscription.details || subscription
      });
    }

    const approveLink = subscription.links?.find(l => l.rel === 'approve')?.href;

    console.log("✅ Assinatura criada:", subscription.id);

    return res.json({
      subscription_id: subscription.id,
      approve: approveLink,
      status: subscription.status
    });

  } catch (err) {
    console.error("ERRO AO CRIAR ASSINATURA:", err);
    return res.status(500).json({
      error: "Erro ao criar assinatura",
      details: err.message
    });
  }
}

export async function getSubscriptionStatus(req, res) {
  try {
    const { subscriptionId } = req.params;
    const token = await getAccessToken();

    const response = await fetch(
      `${process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com'}/v1/billing/subscriptions/${subscriptionId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const subscription = await response.json();

    if (subscription.error) {
      return res.status(404).json({
        error: "Assinatura não encontrada",
        details: subscription
      });
    }

    return res.json({
      id: subscription.id,
      status: subscription.status,
      subscriber: subscription.subscriber,
      plan_id: subscription.plan_id,
      start_time: subscription.start_time,
      billing_info: subscription.billing_info
    });

  } catch (err) {
    console.error("ERRO AO BUSCAR ASSINATURA:", err);
    return res.status(500).json({
      error: "Erro ao buscar assinatura",
      details: err.message
    });
  }
}

export async function cancelSubscription(req, res) {
  try {
    const { subscriptionId } = req.params;
    const { reason } = req.body;
    const token = await getAccessToken();

    const response = await fetch(
      `${process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com'}/v1/billing/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: reason || "Cancelamento solicitado pelo cliente"
        })
      }
    );

    if (response.status === 204) {
      console.log("✅ Assinatura cancelada:", subscriptionId);
      return res.json({
        success: true,
        message: "Assinatura cancelada com sucesso"
      });
    }

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({
        error: "Erro ao cancelar assinatura",
        details: data
      });
    }

    return res.json(data);

  } catch (err) {
    console.error("ERRO AO CANCELAR ASSINATURA:", err);
    return res.status(500).json({
      error: "Erro ao cancelar assinatura",
      details: err.message
    });
  }
}

export async function subscriptionSuccess(req, res) {
  try {
    const { subscription_id, ba_token } = req.query;

    console.log("✅ Assinatura aprovada! ID:", subscription_id);

    if (!subscription_id) {
      return res.status(400).send('ID de assinatura não fornecido');
    }

    const token = await getAccessToken();

    const response = await fetch(
      `${process.env.PAYPAL_BASE_URL || 'https://api-m.paypal.com'}/v1/billing/subscriptions/${subscription_id}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const subscription = await response.json();

    // Aqui você pode salvar no banco de dados
    console.log('Dados da assinatura:', {
      id: subscription.id,
      status: subscription.status,
      email: subscription.subscriber?.email_address,
      start_time: subscription.start_time
    });

    return res.redirect(`https://sitexpres.com.br/sucesso?subscription=${subscription_id}`);

  } catch (err) {
    console.error("ERRO AO PROCESSAR SUCESSO:", err);
    return res.status(500).send('Erro ao processar assinatura');
  }
}

export async function subscriptionCancel(req, res) {
  console.log('❌ Usuário cancelou a assinatura');
  return res.redirect('https://sitexpres.com.br/cancelado');
}

// ==================== WEBHOOKS ====================
export async function webhook(req, res) {
  const event = req.body;

  console.log("\n🔔 Webhook recebido:", event.event_type);
  console.log("Resource ID:", event.resource?.id);

  try {
    // Criar arquivo de log
    await saveWebhookLog(event);

    switch (event.event_type) {
      // Pagamento único
      case 'PAYMENT.CAPTURE.COMPLETED':
      case 'CHECKOUT.ORDER.APPROVED':
        const status = event.resource?.status || '';
        if (status.toUpperCase() === 'COMPLETED' || status.toUpperCase() === 'APPROVED') {
          await paymentSuccess(
            { query: { token: event.resource.id } },
            {
              redirect: (url) => console.log(`[Webhook] Redirecionamento simulado para: ${url}`),
              status: () => ({ send: () => { } }),
              send: () => { }
            }
          );
        }
        console.log('✅ Pagamento processado:', event.resource.id);
        break;

      case 'PAYMENT.CAPTURE.DENIED':
        console.log('❌ Pagamento negado');
        break;

      // Assinaturas
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        console.log('✅ Assinatura ativada:', event.resource.id);
        // Aqui: ativar acesso do usuário
        break;

      case 'BILLING.SUBSCRIPTION.CREATED':
        console.log('📝 Assinatura criada:', event.resource.id);
        break;

      case 'PAYMENT.SALE.COMPLETED':
        console.log('💰 Pagamento recorrente recebido:', event.resource.amount.total);
        // Aqui: renovar acesso do usuário
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        console.log('❌ Assinatura cancelada:', event.resource.id);
        // Aqui: desativar acesso do usuário
        break;

      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        console.log('⏸️ Assinatura suspensa (pagamento falhou):', event.resource.id);
        // Aqui: notificar usuário sobre problema no pagamento
        break;

      case 'BILLING.SUBSCRIPTION.EXPIRED':
        console.log('⏰ Assinatura expirou:', event.resource.id);
        break;

      default:
        console.log('ℹ️ Evento não tratado:', event.event_type);
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("ERRO NO WEBHOOK:", err);
    return res.sendStatus(500);
  }
}

async function saveWebhookLog(event) {
  // Criar pasta de logs se não existir
  const logsDir = path.join(process.cwd(), 'webhook-logs');
  try {
    await fs.mkdir(logsDir, { recursive: true });
  } catch (err) {
    // Pasta já existe
  }

  // Gerar nome do arquivo com data e hora
  const now = new Date();
  const timestamp = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = `webhook_${timestamp}.txt`;
  const filepath = path.join(logsDir, filename);

  // Formatar conteúdo do log
  const logContent = `
      =====================================
      WEBHOOK RECEBIDO
      =====================================
      Data/Hora: ${now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
      Timestamp: ${now.toISOString()}

      EVENTO: ${event.event_type}
      Resource ID: ${event.resource?.id || 'N/A'}

      DADOS COMPLETOS:
      ${JSON.stringify(event, null, 2)}
      =====================================
      `;

  // Salvar arquivo
  await fs.writeFile(filepath, logContent, 'utf8');
  console.log(`📄 Log salvo em: ${filepath}`);
}
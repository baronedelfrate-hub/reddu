import { corsHeaders } from "./cors.ts";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      market_audit_id,
      empresa_id,
      local_nome,
      usuario_nome,
      total_vendido,
      total_itens,
      total_itens_conferidos,
      divergencias = [],
      total_valor_divergencia = 0,
      divergencias_criticas = 0,
      observacao_geral,
      data_auditoria
    } = await req.json();

    console.log('[send-audit-report] Processing audit report email...', {
      market_audit_id,
      local_nome,
      divergencias_count: divergencias.length
    });

    // Validate required fields
    if (!market_audit_id || !empresa_id || !local_nome) {
      throw new Error('Missing required fields: market_audit_id, empresa_id, or local_nome');
    }

    // Get SendGrid API key from Supabase secrets
    const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
    if (!SENDGRID_API_KEY) {
      console.warn('[send-audit-report] SENDGRID_API_KEY not configured - email not sent');
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Email service not configured' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 // Non-blocking error
        }
      );
    }

    // Format currency
    const formatCurrency = (value) => {
      return new Intl.NumberFormat('pt-BR', { 
        style: 'currency', 
        currency: 'BRL' 
      }).format(value || 0);
    };

    // Format date/time
    const formatDateTime = (isoString) => {
      const date = new Date(isoString);
      return date.toLocaleString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    };

    // Build divergências table HTML
    let divergenciasTableRows = '';
    if (divergencias.length > 0) {
      divergencias.forEach(div => {
        const rowColor = div.is_critico ? '#fee2e2' : (div.tipo === 'faltante' ? '#fef3c7' : '#dbeafe');
        const statusColor = div.tipo === 'faltante' ? '#dc2626' : '#2563eb';
        
        divergenciasTableRows += `
          <tr style="background-color: ${rowColor};">
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">
              ${div.produto_nome}
              ${div.is_critico ? '<span style="color: #dc2626; font-weight: bold;"> (CRÍTICO)</span>' : ''}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${div.esperado}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${div.contado}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; font-weight: bold; color: ${statusColor};">
              ${div.diferenca > 0 ? '+' : ''}${div.diferenca}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">
              ${formatCurrency(div.valor_divergencia)}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
              <span style="background-color: ${statusColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600;">
                ${div.tipo === 'faltante' ? 'FALTANTE' : 'EXCEDENTE'}
              </span>
            </td>
          </tr>
        `;
      });
    } else {
      divergenciasTableRows = `
        <tr>
          <td colspan="6" style="padding: 24px; text-align: center; background-color: #d1fae5; color: #047857; font-weight: 600;">
            ✅ Nenhuma divergência encontrada - Estoque está correto
          </td>
        </tr>
      `;
    }

    // Build HTML email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Relatório de Auditoria - ${local_nome}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f9fafb; margin: 0; padding: 20px;">
        <div style="max-width: 800px; margin: 0 auto; background-color: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">
              📊 Relatório de Auditoria de Mercado
            </h1>
            <p style="color: #bfdbfe; margin: 0; font-size: 16px;">
              ${local_nome}
            </p>
          </div>

          <!-- Content -->
          <div style="padding: 32px;">
            
            <!-- Metadata Section -->
            <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #374151;">
                📋 Informações da Auditoria
              </h2>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
                <div>
                  <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Data/Hora</p>
                  <p style="margin: 0; font-size: 14px; font-weight: 700; color: #111827;">${formatDateTime(data_auditoria)}</p>
                </div>
                <div>
                  <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Mercado</p>
                  <p style="margin: 0; font-size: 14px; font-weight: 700; color: #111827;">${local_nome}</p>
                </div>
                <div>
                  <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Operador</p>
                  <p style="margin: 0; font-size: 14px; font-weight: 700; color: #111827;">${usuario_nome}</p>
                </div>
              </div>
            </div>

            <!-- Summary Cards -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
              
              <!-- Total Vendido -->
              <div style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border-radius: 8px; padding: 20px; border: 2px solid #10b981;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #047857; text-transform: uppercase; font-weight: 700;">💰 Total Vendido</p>
                <p style="margin: 0; font-size: 28px; font-weight: 800; color: #065f46;">
                  ${formatCurrency(total_vendido)}
                </p>
              </div>

              <!-- Itens Conferidos -->
              <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 8px; padding: 20px; border: 2px solid #3b82f6;">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: #1e40af; text-transform: uppercase; font-weight: 700;">📦 Itens Conferidos</p>
                <p style="margin: 0; font-size: 28px; font-weight: 800; color: #1e3a8a;">
                  ${total_itens_conferidos}
                </p>
                <p style="margin: 4px 0 0 0; font-size: 12px; color: #2563eb;">Esperado: ${total_itens}</p>
              </div>

              <!-- Divergências -->
              <div style="background: linear-gradient(135deg, ${divergencias_criticas > 0 ? '#fee2e2' : '#fef3c7'} 0%, ${divergencias_criticas > 0 ? '#fecaca' : '#fde68a'} 100%); border-radius: 8px; padding: 20px; border: 2px solid ${divergencias_criticas > 0 ? '#dc2626' : '#f59e0b'};">
                <p style="margin: 0 0 8px 0; font-size: 12px; color: ${divergencias_criticas > 0 ? '#991b1b' : '#92400e'}; text-transform: uppercase; font-weight: 700;">⚠️ Divergências</p>
                <p style="margin: 0; font-size: 28px; font-weight: 800; color: ${divergencias_criticas > 0 ? '#7f1d1d' : '#78350f'};">
                  ${divergencias.length}
                </p>
                ${divergencias_criticas > 0 ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #dc2626; font-weight: 700;">${divergencias_criticas} CRÍTICA(S)</p>` : ''}
              </div>
            </div>

            <!-- Divergências Table -->
            ${divergencias.length > 0 ? `
              <div style="margin-bottom: 24px;">
                <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #374151;">
                  📊 Detalhamento de Divergências
                </h2>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                  <thead>
                    <tr style="background-color: #f9fafb;">
                      <th style="padding: 12px; text-align: left; font-weight: 700; color: #374151; border-bottom: 2px solid #e5e7eb;">Produto</th>
                      <th style="padding: 12px; text-align: center; font-weight: 700; color: #374151; border-bottom: 2px solid #e5e7eb;">Esperado</th>
                      <th style="padding: 12px; text-align: center; font-weight: 700; color: #374151; border-bottom: 2px solid #e5e7eb;">Contado</th>
                      <th style="padding: 12px; text-align: center; font-weight: 700; color: #374151; border-bottom: 2px solid #e5e7eb;">Diferença</th>
                      <th style="padding: 12px; text-align: right; font-weight: 700; color: #374151; border-bottom: 2px solid #e5e7eb;">Valor Div.</th>
                      <th style="padding: 12px; text-align: center; font-weight: 700; color: #374151; border-bottom: 2px solid #e5e7eb;">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${divergenciasTableRows}
                  </tbody>
                </table>

                ${total_valor_divergencia > 0 ? `
                  <div style="margin-top: 16px; background-color: #f3f4f6; padding: 16px; border-radius: 8px; border: 1px solid #d1d5db;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="font-size: 14px; font-weight: 600; color: #374151;">Total Valor Divergência:</span>
                      <span style="font-size: 18px; font-weight: 800; color: #111827;">${formatCurrency(total_valor_divergencia)}</span>
                    </div>
                  </div>
                ` : ''}
              </div>
            ` : `
              <div style="margin-bottom: 24px; background-color: #d1fae5; border-radius: 8px; padding: 24px; text-align: center; border: 2px solid #10b981;">
                <p style="margin: 0; font-size: 18px; font-weight: 700; color: #047857;">
                  ✅ Nenhuma Divergência Encontrada
                </p>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #065f46;">
                  O estoque contado está de acordo com o esperado.
                </p>
              </div>
            `}

            <!-- Observações -->
            ${observacao_geral ? `
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #92400e; font-weight: 700;">📝 Observações do Operador</h3>
                <p style="margin: 0; font-size: 14px; color: #78350f; white-space: pre-wrap;">${observacao_geral}</p>
              </div>
            ` : ''}

            <!-- Footer -->
            <div style="border-top: 2px solid #e5e7eb; padding-top: 16px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                Este relatório foi gerado automaticamente pelo sistema de auditoria de mercados.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #9ca3af;">
                ID da Auditoria: ${market_audit_id}
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // TODO: Configure recipient emails from empresa settings
    // For now, using a placeholder - implement empresa admin email lookup
    const recipientEmail = 'admin@example.com'; // PLACEHOLDER - replace with actual admin email

    // Send email via SendGrid
    const sendGridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: recipientEmail }],
            subject: `[Auditoria] ${local_nome} - ${formatDateTime(data_auditoria)}${divergencias_criticas > 0 ? ' ⚠️ DIVERGÊNCIAS CRÍTICAS' : ''}`
          }
        ],
        from: {
          email: 'noreply@estoque360.com', // Configure your verified sender
          name: 'Estoque 360 - Sistema de Auditoria'
        },
        content: [
          {
            type: 'text/html',
            value: htmlContent
          }
        ]
      })
    });

    if (!sendGridResponse.ok) {
      const errorText = await sendGridResponse.text();
      console.error('[send-audit-report] SendGrid API error:', errorText);
      throw new Error(`SendGrid API error: ${sendGridResponse.status} - ${errorText}`);
    }

    console.log('[send-audit-report] Email sent successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Audit report email sent successfully',
        audit_id: market_audit_id 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[send-audit-report] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
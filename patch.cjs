const fs = require('fs');
let code = fs.readFileSync('src/components/ChatPanel.tsx', 'utf8');

const replacement = `
              if (msg.role === 'tool') {
                let parsed: any;
                try { parsed = JSON.parse(msg.content); } catch (e) { parsed = { error: msg.content }; }
                
                const toolCallMsg = messages.find(m => m.tool_calls && m.tool_calls.some((tc: any) => tc.id === msg.tool_call_id));
                const toolCall = toolCallMsg?.tool_calls?.find((tc: any) => tc.id === msg.tool_call_id);
                let changes: any[] = [];
                if (toolCall) {
                  try { changes = JSON.parse(toolCall.function.arguments).changes || []; } catch(e) {}
                }

                return (
                  <div key={i} className="flex w-full justify-start my-2">
                    <div className="bg-muted/50 border border-border/50 rounded-lg px-4 py-3 text-xs w-full max-w-[80%]">
                      <div className="flex items-center gap-2 text-muted-foreground font-semibold mb-2">
                        <Cpu className="w-3.5 h-3.5" /> 
                        {msg.name === 'simulate' ? 'Simulation (Scratchpad)' : 'Proposed Changes'}
                      </div>
                      {parsed.error ? (
                        <div className="text-red-500">{parsed.error}</div>
                      ) : (
                        <div className="space-y-3">
                          {changes.length > 0 && (
                            <div className="space-y-1 border-b border-border/50 pb-2 mb-2">
                              <div className="font-semibold text-muted-foreground mb-1">Actions:</div>
                              {changes.map((c, idx) => (
                                <div key={idx} className="flex gap-2">
                                  <span>⚙️</span>
                                  <span>
                                    {c.type === 'skip_event' && \`Skip event \${c.event_id} on \${c.date}\`}
                                    {c.type === 'pause_event' && \`Pause event \${c.event_id} from \${c.from_date} to \${c.to_date}\`}
                                    {c.type === 'move_event' && \`Move event \${c.event_id} from \${c.from_date} to \${c.to_date}\`}
                                    {c.type === 'set_amount' && \`Set amount for \${c.event_id} to \${formatCurrency(c.amount_cents / 100)}\`}
                                    {c.type === 'pay_debt' && \`Pay \${formatCurrency(c.amount_cents / 100)} from \${c.from_account_id} to \${c.card_id}\`}
                                    {c.type === 'add_one_time' && \`Add one-time \${formatCurrency(c.amount_cents / 100)} from \${c.from_account_id} on \${c.date}\`}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="space-y-2">
                            <div className="font-semibold text-muted-foreground">Impact:</div>
                            {parsed.diff && Object.keys(parsed.diff.affected_accounts).map(accId => {
                               const acc = parsed.diff.affected_accounts[accId];
                               return (
                                 <div key={accId} className="bg-background rounded px-3 py-2 border border-border">
                                   <div className="font-semibold">{acc.name}</div>
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                                     <div>Lowest: {formatCurrency(acc.lowest_balance_before)} ➔ {formatCurrency(acc.lowest_balance_after)}</div>
                                     <div>Breach: {acc.first_breach_before} ➔ {acc.first_breach_after}</div>
                                   </div>
                                 </div>
                               );
                            })}
                          </div>
                          {msg.name === 'propose_blueprint_changes' && (
                            <Button size="sm" className="w-full mt-2" onClick={() => alert("Not implemented yet")}>Apply to Plan</Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
`;

const startStr = "              if (msg.role === 'tool') {";
const endStr = "              if (!msg.content && msg.role === 'assistant') return null;";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
  fs.writeFileSync('src/components/ChatPanel.tsx', code);
  console.log('Replaced successfully');
} else {
  console.log('Could not find block');
}

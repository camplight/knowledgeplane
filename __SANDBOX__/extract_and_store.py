#!/usr/bin/env python3
import pandas as pd
import json
import sys

# Read the Excel file
xls = pd.ExcelFile('Highlevel overview.xlsx')

# Extract data from Items sheet
items_df = pd.read_excel(xls, sheet_name='Items')

# Prepare facts for knowledgeplane
facts = []

# Store summary totals
estimated_total = None
actual_total = None
total_total = None

# Process Items sheet
for idx, row in items_df.iterrows():
    item_name = str(row.get('име', '')).strip() if pd.notna(row.get('име')) else None
    price = row.get('цена')
    contractor = str(row.get('изпълнител', '')).strip() if pd.notna(row.get('изпълнител')) else None
    location = str(row.get('място', '')).strip() if pd.notna(row.get('място')) else None
    purchase_by = str(row.get('закупуване', '')).strip() if pd.notna(row.get('закупуване')) else None
    quantity = str(row.get('количество', '')).strip() if pd.notna(row.get('количество')) else None
    
    # Check for totals
    if item_name and 'ESTIMATED TOTAL' in str(item_name).upper():
        estimated_total = price
        facts.append({
            "content": f"Estimated total for the project: {price}",
            "knowledge_context": "project_finances",
            "metadata": {
                "type": "total",
                "category": "estimated",
                "amount": str(price) if pd.notna(price) else "unknown"
            }
        })
    elif item_name and 'ACTUAL TOTAL' in str(item_name).upper():
        actual_total = price
        facts.append({
            "content": f"Actual total paid: {price}",
            "knowledge_context": "project_finances",
            "metadata": {
                "type": "total",
                "category": "actual",
                "amount": str(price) if pd.notna(price) else "unknown"
            }
        })
    elif item_name and 'TOTAL TOTAL' in str(item_name).upper():
        total_total = price
        facts.append({
            "content": f"Grand total (including additional expenses): {price}",
            "knowledge_context": "project_finances",
            "metadata": {
                "type": "total",
                "category": "grand_total",
                "amount": str(price) if pd.notna(price) else "unknown"
            }
        })
    elif item_name and 'ACTUAL PAYMENTS' in str(item_name).upper():
        # Skip the header row
        continue
    elif pd.notna(price) and pd.notna(item_name) and item_name.strip():
        # Regular item
        item_fact = f"Item: {item_name}"
        if pd.notna(price):
            item_fact += f", Price: {price}"
        if contractor:
            item_fact += f", Contractor: {contractor}"
        if location:
            item_fact += f", Location: {location}"
        if purchase_by:
            item_fact += f", Purchased by: {purchase_by}"
        if quantity:
            item_fact += f", Quantity: {quantity}"
        
        facts.append({
            "content": item_fact,
            "knowledge_context": "project_items",
            "metadata": {
                "type": "item",
                "item_name": item_name,
                "price": str(price) if pd.notna(price) else "unknown",
                "contractor": contractor if contractor else "none",
                "location": location if location else "none",
                "purchase_by": purchase_by if purchase_by else "none",
                "quantity": quantity if quantity else "none"
            }
        })
    elif contractor and pd.notna(price) and pd.notna(row.get('име', '')) == False:
        # Payment entry (row with contractor but no item name)
        payment_note = str(row.get('количество', '')).strip() if pd.notna(row.get('количество')) else ""
        facts.append({
            "content": f"Payment to {contractor}: {price}. {payment_note}",
            "knowledge_context": "project_payments",
            "metadata": {
                "type": "payment",
                "contractor": contractor,
                "amount": str(price),
                "note": payment_note
            }
        })
    elif pd.notna(price) and not item_name and not contractor:
        # Additional expense
        expense_note = str(row.get('количество', '')).strip() if pd.notna(row.get('количество')) else ""
        facts.append({
            "content": f"Additional expense: {price}. {expense_note}",
            "knowledge_context": "project_expenses",
            "metadata": {
                "type": "expense",
                "amount": str(price),
                "note": expense_note
            }
        })

# Process Status sheet
status_df = pd.read_excel(xls, sheet_name='Статус')
for idx, row in status_df.iterrows():
    status_text = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else None
    if status_text and status_text.lower() not in ['nan', 'none', '']:
        if idx == 0 or 'свършено' in status_text.lower():
            facts.append({
                "content": f"Completed: {status_text}",
                "knowledge_context": "project_status",
                "metadata": {
                    "type": "status",
                    "status": "completed",
                    "description": status_text
                }
            })
        elif 'извън договора' in status_text.lower() or 'забележки' in status_text.lower():
            facts.append({
                "content": f"Note/Issue: {status_text}",
                "knowledge_context": "project_status",
                "metadata": {
                    "type": "status",
                    "status": "note",
                    "description": status_text
                }
            })
        elif 'оставащо' in status_text.lower() or idx > 17:
            facts.append({
                "content": f"Remaining work: {status_text}",
                "knowledge_context": "project_status",
                "metadata": {
                    "type": "status",
                    "status": "remaining",
                    "description": status_text
                }
            })

# Process Contacts sheet
contacts_df = pd.read_excel(xls, sheet_name='Contacts')
for idx, row in contacts_df.iterrows():
    name = str(row.get('Name', '')).strip() if pd.notna(row.get('Name')) else None
    tel = str(row.get('Tel', '')).strip() if pd.notna(row.get('Tel')) else None
    scope = str(row.get('Scope', '')).strip() if pd.notna(row.get('Scope')) else None
    results = str(row.get('Results', '')).strip() if pd.notna(row.get('Results')) else None
    
    if name:
        contact_fact = f"Contact: {name}"
        if tel:
            contact_fact += f", Phone: {tel}"
        if scope:
            contact_fact += f", Scope: {scope}"
        if results:
            contact_fact += f", Results: {results}"
        
        facts.append({
            "content": contact_fact,
            "knowledge_context": "project_contacts",
            "metadata": {
                "type": "contact",
                "name": name,
                "phone": tel if tel else "none",
                "scope": scope if scope else "none",
                "results": results if results else "none"
            }
        })

# Calculate contractor totals
contractor_totals = {}
for fact in facts:
    if fact.get('metadata', {}).get('type') == 'payment':
        contractor = fact['metadata'].get('contractor', '')
        amount = float(fact['metadata'].get('amount', 0))
        if contractor:
            contractor_totals[contractor] = contractor_totals.get(contractor, 0) + amount

# Add contractor total facts
for contractor, total in contractor_totals.items():
    facts.append({
        "content": f"Total paid to contractor {contractor}: {total}",
        "knowledge_context": "project_finances",
        "metadata": {
            "type": "contractor_total",
            "contractor": contractor,
            "total_amount": str(total)
        }
    })

# Calculate difference between estimated and actual
if estimated_total and actual_total:
    difference = actual_total - estimated_total
    facts.append({
        "content": f"Difference between actual and estimated: {difference} (actual is {difference} above estimated)",
        "knowledge_context": "project_finances",
        "metadata": {
            "type": "difference",
            "estimated": str(estimated_total),
            "actual": str(actual_total),
            "difference": str(difference)
        }
    })

# Output as JSON for the MCP tool
print(json.dumps(facts, indent=2, ensure_ascii=False))


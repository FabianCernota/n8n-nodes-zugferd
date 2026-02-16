# Verwendungsbeispiele

## Beispiel 1: PDF von URL laden und verarbeiten

```
HTTP Request (GET PDF) → ZUGFeRD Reader → Set Node (Rechnung verarbeiten)
```

**HTTP Request Node:**
- Method: GET
- URL: `https://example.com/invoice.pdf`
- Response Format: File
- Binary Property: `data`

**ZUGFeRD Reader Node:**
- Input Mode: Binary Data
- Binary Property: `data`
- Output Format: Parsed JSON

**Set Node (Rechnung verarbeiten):**
```javascript
// Zugriff auf Rechnungsdaten
const invoice = $json.invoice;
const rechnungsNr = invoice['rsm:CrossIndustryInvoice']?.['rsm:ExchangedDocument']?.['ram:ID'];
const gesamtBetrag = invoice['rsm:CrossIndustryInvoice']?.['rsm:SupplyChainTradeTransaction']?.['ram:ApplicableHeaderTradeSettlement']?.['ram:SpecifiedTradeSettlementHeaderMonetarySummation']?.['ram:GrandTotalAmount'];

return {
  rechnungsNummer: rechnungsNr,
  betrag: parseFloat(gesamtBetrag),
  waehrung: 'EUR'
};
```

## Beispiel 2: Lokale PDF-Datei lesen

**ZUGFeRD Reader Node:**
- Input Mode: File Path
- File Path: `/path/to/invoice.pdf`
- Output Format: Both (JSON + XML)

## Beispiel 3: E-Mail-Anhang verarbeiten

```
Email Trigger → Extract Attachments → ZUGFeRD Reader → Database Insert
```

**Email Trigger:**
- Wartet auf neue E-Mails mit PDF-Anhängen

**Extract Attachments:**
- Extrahiert PDF aus E-Mail

**ZUGFeRD Reader:**
- Input Mode: Binary Data
- Binary Property: `data`
- Output Format: Parsed JSON

**Database Insert:**
- Speichert Rechnungsdaten in Datenbank

## Beispiel 4: Batch-Verarbeitung mehrerer PDFs

```
Read Binary Files (*.pdf) → ZUGFeRD Reader → Function Node → Spreadsheet
```

**Function Node - Daten aufbereiten:**
```javascript
const items = [];

for (const item of $input.all()) {
  const invoice = item.json.invoice?.['rsm:CrossIndustryInvoice'];

  if (invoice) {
    const doc = invoice['rsm:ExchangedDocument'];
    const trade = invoice['rsm:SupplyChainTradeTransaction'];
    const seller = trade?.['ram:ApplicableHeaderTradeAgreement']?.['ram:SellerTradeParty'];
    const buyer = trade?.['ram:ApplicableHeaderTradeAgreement']?.['ram:BuyerTradeParty'];
    const monetary = trade?.['ram:ApplicableHeaderTradeSettlement']?.['ram:SpecifiedTradeSettlementHeaderMonetarySummation'];

    items.push({
      json: {
        rechnungsNummer: doc?.['ram:ID'],
        datum: doc?.['ram:IssueDateTime']?.['#text'],
        lieferant: seller?.['ram:Name'],
        kunde: buyer?.['ram:Name'],
        nettoBetrag: monetary?.['ram:TaxBasisTotalAmount'],
        steuerBetrag: monetary?.['ram:TaxTotalAmount'],
        bruttoBetrag: monetary?.['ram:GrandTotalAmount'],
        waehrung: trade?.['ram:ApplicableHeaderTradeSettlement']?.['ram:InvoiceCurrencyCode']
      }
    });
  }
}

return items;
```

## Beispiel 5: Fehlerbehandlung

**ZUGFeRD Reader Node:**
- Aktiviere "Continue On Fail" in den Node Settings
- Bei Fehler wird ein Error-Objekt zurückgegeben

**IF Node - Fehlerprüfung:**
```javascript
// Prüfe ob Fehler aufgetreten ist
return $json.error === undefined;
```

**Bei Erfolg:** Weiter zur Verarbeitung
**Bei Fehler:** Log-Node oder Benachrichtigung

## Beispiel 6: Verschiedene ZUGFeRD-Versionen

Der Node erkennt automatisch:
- ZUGFeRD 1.0 (`ZUGFeRD-invoice.xml`)
- ZUGFeRD 2.x (`factur-x.xml`)
- XRechnung (`xrechnung.xml`)

Wenn Auto-Detect nicht funktioniert:
- XML Attachment Name: Custom Name
- Custom Attachment Name: `dein-custom-name.xml`

## Typische Datenstruktur (ZUGFeRD 2.x / Factur-X)

```json
{
  "rsm:CrossIndustryInvoice": {
    "@_xmlns:rsm": "urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100",
    "@_xmlns:ram": "urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100",
    "@_xmlns:qdt": "urn:un:unece:uncefact:data:standard:QualifiedDataType:100",
    "@_xmlns:udt": "urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100",

    "rsm:ExchangedDocumentContext": {
      "ram:GuidelineSpecifiedDocumentContextParameter": {
        "ram:ID": "urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:extended"
      }
    },

    "rsm:ExchangedDocument": {
      "ram:ID": "RE-2024-0001",
      "ram:TypeCode": "380",
      "ram:IssueDateTime": {
        "@_format": "102",
        "#text": "20240115"
      }
    },

    "rsm:SupplyChainTradeTransaction": {
      "ram:ApplicableHeaderTradeAgreement": {
        "ram:SellerTradeParty": {
          "ram:Name": "Lieferant GmbH",
          "ram:PostalTradeAddress": {
            "ram:PostcodeCode": "12345",
            "ram:LineOne": "Musterstraße 1",
            "ram:CityName": "Berlin",
            "ram:CountryID": "DE"
          },
          "ram:SpecifiedTaxRegistration": {
            "ram:ID": {
              "@_schemeID": "VA",
              "#text": "DE123456789"
            }
          }
        },
        "ram:BuyerTradeParty": {
          "ram:Name": "Kunde AG"
        }
      },

      "ram:ApplicableHeaderTradeSettlement": {
        "ram:InvoiceCurrencyCode": "EUR",
        "ram:SpecifiedTradeSettlementHeaderMonetarySummation": {
          "ram:TaxBasisTotalAmount": "1000.00",
          "ram:TaxTotalAmount": {
            "@_currencyID": "EUR",
            "#text": "190.00"
          },
          "ram:GrandTotalAmount": {
            "@_currencyID": "EUR",
            "#text": "1190.00"
          },
          "ram:DuePayableAmount": {
            "@_currencyID": "EUR",
            "#text": "1190.00"
          }
        }
      }
    }
  }
}
```

## Tipps

1. **Namespace Handling:** ZUGFeRD/Factur-X verwendet XML-Namespaces (`rsm:`, `ram:`, etc.). Diese werden im JSON beibehalten.

2. **Attribute vs. Text:** XML-Attribute werden mit `@_` prefix gespeichert, Text-Content als `#text`.

3. **Array vs. Objekt:** Einzelne Elemente werden als Objekt geparst, mehrere als Array. Prüfe immer mit `Array.isArray()`.

4. **Währungen:** Beträge haben oft ein `@_currencyID` Attribut.

5. **Datumsformat:** Datum ist oft im Format `YYYYMMDD` (format="102").

6. **Debugging:** Nutze "Both" als Output Format um das Original-XML zu sehen.

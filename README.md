# N8N ZUGFeRD Reader Node

Ein N8N Custom Node zum Extrahieren von ZUGFeRD/Factur-X XML-Daten aus PDF-Rechnungen.

## Features

- ✅ Extrahiert ZUGFeRD und Factur-X XML aus PDF-Dateien
- ✅ Automatische Erkennung der XML-Anhänge
- ✅ Unterstützt Binary Data und Dateipfad als Input
- ✅ Ausgabe als JSON oder Raw XML
- ✅ Listet alle verfügbaren Anhänge auf

## Installation

### In N8N installieren

1. **Als Community Node:**
   ```bash
   npm install n8n-nodes-zugferd-reader
   ```

2. **Manuell installieren:**
   ```bash
   # Projekt bauen
   npm install
   npm run build

   # In N8N custom nodes Verzeichnis kopieren
   cp -r dist ~/.n8n/custom/
   ```

3. **Entwicklungsmodus:**
   ```bash
   npm install
   npm run dev

   # N8N mit custom nodes starten
   n8n start
   ```

## Verwendung

### Input Modes

**Binary Data (Standard):**
- Verwendet die Binary Data aus einem vorherigen Node
- Ideal für Workflows mit HTTP Request, Read Binary File, etc.

**File Path:**
- Liest PDF direkt vom Dateisystem
- Nützlich für lokale Dateien

### Output Formats

**Parsed JSON (Standard):**
- Wandelt XML in JSON um
- Einfach zu verarbeiten in nachfolgenden Nodes

**Raw XML:**
- Gibt das originale XML zurück
- Nützlich wenn du das XML weiterverarbeiten möchtest

**Both:**
- Gibt sowohl JSON als auch XML zurück

### Beispiel Workflow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐
│  HTTP Request   │───▶│  ZUGFeRD Reader  │───▶│  Process    │
│  (Get PDF)      │    │                  │    │  Invoice    │
└─────────────────┘    └──────────────────┘    └─────────────┘
```

### Beispiel Output

```json
{
  "attachmentName": "factur-x.xml",
  "availableAttachments": ["factur-x.xml"],
  "invoice": {
    "rsm:CrossIndustryInvoice": {
      "rsm:ExchangedDocumentContext": {
        "ram:GuidelineSpecifiedDocumentContextParameter": {
          "ram:ID": "urn:cen.eu:en16931:2017"
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
            "ram:Name": "Muster GmbH"
          },
          "ram:BuyerTradeParty": {
            "ram:Name": "Kunde AG"
          }
        },
        "ram:ApplicableHeaderTradeSettlement": {
          "ram:InvoiceCurrencyCode": "EUR",
          "ram:SpecifiedTradeSettlementHeaderMonetarySummation": {
            "ram:TaxBasisTotalAmount": "1000.00",
            "ram:TaxTotalAmount": "190.00",
            "ram:GrandTotalAmount": "1190.00"
          }
        }
      }
    }
  }
}
```

## Unterstützte Standards

- ZUGFeRD 1.0 / 2.x
- Factur-X
- XRechnung
- EN16931 (CII Format)

## Technische Details

### Dependencies

- `pdf-lib`: PDF-Manipulation und Anhang-Extraktion
- `fast-xml-parser`: Schnelles XML-zu-JSON Parsing

### Wie es funktioniert

1. PDF wird geladen (aus Binary Data oder Dateisystem)
2. Eingebettete Dateien werden aus dem PDF extrahiert
3. XML-Anhänge werden identifiziert (auto oder custom)
4. XML wird optional zu JSON geparst
5. Daten werden als Output zurückgegeben

### Error Handling

Der Node bietet detaillierte Fehlermeldungen:
- Keine eingebetteten Dateien gefunden
- Kein ZUGFeRD XML gefunden (mit Liste verfügbarer Anhänge)
- PDF-Lesefehler
- XML-Parsing-Fehler

## Entwicklung

```bash
# Dependencies installieren
npm install

# TypeScript kompilieren
npm run build

# Watch mode für Entwicklung
npm run dev

# In lokalem N8N testen
N8N_CUSTOM_EXTENSIONS=~/.n8n/custom n8n start
```

## Lizenz

MIT

## Support

Bei Problemen oder Fragen, bitte ein Issue erstellen.

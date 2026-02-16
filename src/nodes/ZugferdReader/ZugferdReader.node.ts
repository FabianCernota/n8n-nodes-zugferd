import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { PDFDocument } from 'pdf-lib';
import { XMLParser } from 'fast-xml-parser';

export class ZugferdReader implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ZUGFeRD Reader',
		name: 'zugferdReader',
		icon: 'file:zugferd.svg',
		group: ['transform'],
		version: 1,
		description: 'Extract ZUGFeRD/Factur-X XML data from PDF invoices',
		defaults: {
			name: 'ZUGFeRD Reader',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Input Mode',
				name: 'inputMode',
				type: 'options',
				options: [
					{
						name: 'Binary Data',
						value: 'binary',
						description: 'Read PDF from binary data property',
					},
					{
						name: 'File Path',
						value: 'filepath',
						description: 'Read PDF from file system path',
					},
				],
				default: 'binary',
				description: 'How to provide the PDF file',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryProperty',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						inputMode: ['binary'],
					},
				},
				description: 'Name of the binary property containing the PDF',
			},
			{
				displayName: 'File Path',
				name: 'filePath',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						inputMode: ['filepath'],
					},
				},
				description: 'Path to the PDF file on the file system',
			},
			{
				displayName: 'Output Format',
				name: 'outputFormat',
				type: 'options',
				options: [
					{
						name: 'Parsed JSON',
						value: 'json',
						description: 'Parse XML and return as JSON object',
					},
					{
						name: 'Raw XML',
						value: 'xml',
						description: 'Return raw XML string',
					},
					{
						name: 'Both',
						value: 'both',
						description: 'Return both parsed JSON and raw XML',
					},
				],
				default: 'json',
				description: 'Format of the output data',
			},
			{
				displayName: 'XML Attachment Name',
				name: 'xmlAttachmentName',
				type: 'options',
				options: [
					{
						name: 'Auto-Detect',
						value: 'auto',
						description: 'Automatically detect ZUGFeRD/Factur-X XML',
					},
					{
						name: 'Custom Name',
						value: 'custom',
						description: 'Specify custom attachment name',
					},
				],
				default: 'auto',
				description: 'Name of the XML attachment in the PDF',
			},
			{
				displayName: 'Custom Attachment Name',
				name: 'customAttachmentName',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						xmlAttachmentName: ['custom'],
					},
				},
				description: 'Custom name of the XML attachment to extract',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const inputMode = this.getNodeParameter('inputMode', itemIndex) as string;
				const outputFormat = this.getNodeParameter('outputFormat', itemIndex) as string;
				const xmlAttachmentName = this.getNodeParameter('xmlAttachmentName', itemIndex) as string;

				let pdfBytes: Uint8Array;

				// Get PDF data based on input mode
				if (inputMode === 'binary') {
					const binaryProperty = this.getNodeParameter('binaryProperty', itemIndex) as string;
					const binaryData = this.helpers.assertBinaryData(itemIndex, binaryProperty);
					pdfBytes = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProperty);
				} else {
					const filePath = this.getNodeParameter('filePath', itemIndex) as string;
					const fs = await import('fs/promises');
					pdfBytes = await fs.readFile(filePath);
				}

				// Load PDF document
				const pdfDoc = await PDFDocument.load(pdfBytes);

				// Get embedded files
				const embeddedFiles = this.getEmbeddedFiles(pdfDoc);

				if (embeddedFiles.length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						'No embedded files found in PDF',
						{ itemIndex }
					);
				}

				// Find ZUGFeRD/Factur-X XML
				let xmlData: string | null = null;
				let foundAttachmentName: string | null = null;

				if (xmlAttachmentName === 'auto') {
					// Auto-detect common ZUGFeRD/Factur-X names
					const commonNames = [
						'factur-x.xml',
						'FacturX.xml',
						'zugferd-invoice.xml',
						'ZUGFeRD-invoice.xml',
						'xrechnung.xml',
						'XRechnung.xml',
					];

					for (const file of embeddedFiles) {
						const fileName = file.name.toLowerCase();
						if (
							commonNames.some(name => fileName.includes(name.toLowerCase())) ||
							fileName.endsWith('.xml')
						) {
							xmlData = file.data;
							foundAttachmentName = file.name;
							break;
						}
					}
				} else {
					const customName = this.getNodeParameter('customAttachmentName', itemIndex) as string;
					const file = embeddedFiles.find(f => f.name === customName);
					if (file) {
						xmlData = file.data;
						foundAttachmentName = file.name;
					}
				}

				if (!xmlData) {
					throw new NodeOperationError(
						this.getNode(),
						`No ZUGFeRD/Factur-X XML found. Available attachments: ${embeddedFiles.map(f => f.name).join(', ')}`,
						{ itemIndex }
					);
				}

				// Prepare output based on format
				let json: any = {};

				if (outputFormat === 'json' || outputFormat === 'both') {
					const parser = new XMLParser({
						ignoreAttributes: false,
						attributeNamePrefix: '@_',
						textNodeName: '#text',
						parseAttributeValue: true,
						parseTagValue: true,
					});
					json = parser.parse(xmlData);
				}

				const outputData: any = {
					attachmentName: foundAttachmentName,
					availableAttachments: embeddedFiles.map(f => f.name),
				};

				if (outputFormat === 'json') {
					outputData.invoice = json;
				} else if (outputFormat === 'xml') {
					outputData.xml = xmlData;
				} else {
					outputData.invoice = json;
					outputData.xml = xmlData;
				}

				returnData.push({
					json: outputData,
				});

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}

	private getEmbeddedFiles(pdfDoc: PDFDocument): Array<{ name: string; data: string }> {
		const embeddedFiles: Array<{ name: string; data: string }> = [];

		try {
			const context = pdfDoc.context;
			const catalog = context.lookup(context.trailerInfo.Root) as any;

			if (!catalog || !catalog.get) {
				return embeddedFiles;
			}

			const names = catalog.lookup('Names');
			if (!names) {
				return embeddedFiles;
			}

			const embeddedFilesRef = names.lookup('EmbeddedFiles');
			if (!embeddedFilesRef) {
				return embeddedFiles;
			}

			const namesArray = this.extractNamesArray(embeddedFilesRef);

			for (let i = 0; i < namesArray.length; i += 2) {
				const fileName = namesArray[i];
				const fileSpec = namesArray[i + 1];

				if (fileSpec && fileSpec.lookup) {
					const efDict = fileSpec.lookup('EF');
					if (efDict && efDict.lookup) {
						const fileStream = efDict.lookup('F');
						if (fileStream && fileStream.contents) {
							const contents = fileStream.contents;
							const decoder = new TextDecoder('utf-8');
							const text = decoder.decode(contents);
							embeddedFiles.push({
								name: fileName,
								data: text,
							});
						}
					}
				}
			}
		} catch (error) {
			// If extraction fails, return empty array
		}

		return embeddedFiles;
	}

	private extractNamesArray(obj: any): any[] {
		if (obj.lookup) {
			const kids = obj.lookup('Kids');
			if (kids && Array.isArray(kids)) {
				let result: any[] = [];
				for (const kid of kids) {
					result = result.concat(this.extractNamesArray(kid));
				}
				return result;
			}

			const names = obj.lookup('Names');
			if (names && Array.isArray(names)) {
				return names;
			}
		}

		return [];
	}
}

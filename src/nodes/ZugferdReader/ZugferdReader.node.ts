import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { PDFDocument } from 'pdf-lib';
import { XMLParser } from 'fast-xml-parser';
import { inflateSync } from 'zlib';

interface EmbeddedFile {
	name: string;
	data: string;
}

function extractNamesArray(obj: any): any[] {
	if (obj.lookup) {
		const kids = obj.lookup('Kids');
		if (kids && Array.isArray(kids)) {
			let result: any[] = [];
			for (const kid of kids) {
				result = result.concat(extractNamesArray(kid));
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

function getEmbeddedFiles(pdfDoc: PDFDocument): EmbeddedFile[] {
	const embeddedFiles: EmbeddedFile[] = [];

	try {
		const context = pdfDoc.context as any;
		const catalog = context.lookup(context.trailerInfo.Root) as any;

		if (!catalog || !catalog.dict) {
			return embeddedFiles;
		}

		// Method 1: Try /AF (Associated Files) - used by many modern ZUGFeRD PDFs
		for (const [key, value] of (catalog.dict.entries() as any)) {
			const keyStr = key.toString();

			if (keyStr === '/AF' && value.array) {
				for (const fileSpecRef of value.array) {
					const fileSpec = context.lookup(fileSpecRef);

					if (fileSpec && fileSpec.dict) {
						const fileData = extractFileFromSpec(context, fileSpec);
						if (fileData) {
							embeddedFiles.push(fileData);
						}
					}
				}
			}
		}

		// Method 2: Try /Names/EmbeddedFiles - traditional method
		const names = catalog.lookup('Names');
		if (names) {
			const embeddedFilesRef = names.lookup('EmbeddedFiles');
			if (embeddedFilesRef) {
				const namesArray = extractNamesArray(embeddedFilesRef);

				for (let i = 0; i < namesArray.length; i += 2) {
					const fileName = namesArray[i];
					const fileSpec = namesArray[i + 1];

					if (fileSpec && fileSpec.lookup) {
						const efDict = fileSpec.lookup('EF');
						if (efDict && efDict.lookup) {
							const fileStream = efDict.lookup('F');
							if (fileStream) {
								const contents = extractAndDecodeStream(context, fileStream);
								if (contents) {
									embeddedFiles.push({
										name: fileName,
										data: contents,
									});
								}
							}
						}
					}
				}
			}
		}
	} catch (error) {
		// If extraction fails, return empty array
	}

	return embeddedFiles;
}

function extractFileFromSpec(context: any, fileSpec: any): EmbeddedFile | null {
	try {
		// Get filename and EF dict from fileSpec
		let fileName = 'unknown';
		let efDictRef = null;

		for (const [key, value] of fileSpec.dict.entries()) {
			const keyStr = key.toString();

			if (keyStr === '/F' || keyStr === '/UF') {
				fileName = value.value || value.toString();
			}

			if (keyStr === '/EF') {
				efDictRef = value;
			}
		}

		// Get embedded file stream from EF dict
		if (efDictRef) {
			const efDict = efDictRef.constructor?.name === 'PDFRef' ? context.lookup(efDictRef) : efDictRef;

			if (efDict && efDict.dict) {
				for (const [key, value] of efDict.dict.entries()) {
					if (key.toString() === '/F') {
						const stream = context.lookup(value);
						if (stream) {
							const contents = extractAndDecodeStream(context, stream);
							if (contents) {
								return {
									name: fileName,
									data: contents,
								};
							}
						}
					}
				}
			}
		}
	} catch (error) {
		// Ignore errors for individual files
	}

	return null;
}

function extractAndDecodeStream(context: any, stream: any): string | null {
	try {
		if (!stream.contents) {
			return null;
		}

		let contents = stream.contents;

		// Check for compression filters
		if (stream.dict) {
			for (const [key, value] of stream.dict.entries()) {
				if (key.toString() === '/Filter') {
					const filterStr = value.toString();

					// Handle FlateDecode compression
					if (filterStr.includes('FlateDecode')) {
						try {
							contents = inflateSync(Buffer.from(contents));
						} catch (error) {
							// If decompression fails, try using raw contents
							return null;
						}
					}
				}
			}
		}

		// Decode as UTF-8
		const decoder = new TextDecoder('utf-8');
		return decoder.decode(contents);
	} catch (error) {
		return null;
	}
}

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
				const embeddedFiles = getEmbeddedFiles(pdfDoc);

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
					const file = embeddedFiles.find((f: EmbeddedFile) => f.name === customName);
					if (file) {
						xmlData = file.data;
						foundAttachmentName = file.name;
					}
				}

				if (!xmlData) {
					throw new NodeOperationError(
						this.getNode(),
						`No ZUGFeRD/Factur-X XML found. Available attachments: ${embeddedFiles.map((f: EmbeddedFile) => f.name).join(', ')}`,
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
					availableAttachments: embeddedFiles.map((f: EmbeddedFile) => f.name),
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
							error: error instanceof Error ? error.message : String(error),
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

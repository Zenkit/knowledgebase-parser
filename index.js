const { convertHTMLToMarkdown } = require('./mdConverter');
const _ = require('lodash');
const uuidv4 = require('uuidv4').default;
const promisePool = require('es6-promise-pool');

const config = (function () {
	// const baseUrl = 'https://zenkit.com/api/v1';
	const baseUrl = 'http://localhost:9000/api/v1';

	// To reuse existing target elements, set 'targetKey' to the corresponding value
	let mapping = [
		{
			sourceKey: 'b2444557-36cb-4e1f-8b5c-109e88ce9e0c_text',
			ecName: 'Textfield',
			targetName: 'Wiki Content',
			targetKey: '53a2412b-0446-42e7-bedb-6822b73d68eb_text',
			targetUuid: uuidv4()
		}, {
			sourceKey: 'displayString',
			isPrimary: true
		}, {
			sourceKey: '11bbb3ed-fee1-451c-82ab-5c2b92a35cb9_text',
			ecName: 'Textfield',
			targetName: 'Wiki Content - Draft',
			targetKey: 'a876bb9f-7072-479c-a0d0-7b4cb1b475c7_text',
			targetUuid: uuidv4()
		}, {
			sourceKey: 'ace42fea-dd18-4d3d-a5ff-8e9e048ff81e_filesData',
			ecName: 'Files'
		}
	];

	return {
		apiToken: 'jt06vco3-MM42g74XPFpZukq1ICLDcy66rRVpKqPa',//'k2andcuv-kYRsC7ESESPYDU4jBN7ZKU01G67TGhVE',
		mapping,
		baseUrl,
		targetListShortId: 'Ov4NprRxO',
		maxConcurrency: 5,
		
		// Used for local testing
		sourceDataPath: './kanban_data.json', // Set 'sourceDataPath' or 'sourceListShortId' to use a different source-collection
		// sourceListShortId: 'Ov4NprRxO', // Can be used instead of 'sourceDataPath' -> .json
		fileBaseUrl: 'https://zenkit.com/api/v1', 
	};
}());

const matchAllRegex = (regex, string) => {
	const matches = [];

	let match;
	while ((match = regex.exec(string)) !== null) {
		matches.push({
			captures: match.slice(1),
			index: match.index,
			length: match[0].length
		});
	};
	return matches;
}

const getFileForName = (entry, fileName) => {
	const filesDataKey = _.find(config.mapping, {ecName: 'Files'}).sourceKey;

	let foundFile = entry[filesDataKey].find(file => {
		let fileNameWithWhitespace = file.fileName.replace(/\_/g, ' ').toLowerCase();
		return fileNameWithWhitespace === fileName.toLowerCase();
	});
	if (_.isNil(foundFile)) {
		console.error(`Could not find file for name "${fileName}"`);
		return {id: 'unknown'};
	}
	return foundFile;
};

const replaceCustomSyntax = (entry, inputText) => {

	if (_.isNil(inputText)) {
		return;
	}

	const replacingEngines = [
		{ // Honor linebreaks
			regex: /^([^<].*)/gm,
			replacer: captures => `<p>${captures[0]}</p>`
		},
		{ // files
			regex: /\[file ([^\[\]]*)\]/gm,
			replacer: captures => {
				const file = getFileForName(entry, captures[0])
				const fileLink = (config.fileBaseUrl || config.baseUrl) + `/lists/${entry.listId}/files/${file.id}`;
				return `<img src="${fileLink}" alt="">`
			}
		},
		{ // script
			regex: /\[script[^\[\]]+src="([^\[\"]+)"[^\[\]]*\]\[\/script\]/gm,
			replacer: captures => `<a href="${captures[0]}" zenkit-inline></a>`
		},
		{
			regex: /href="https:\/\/zenkit.com\/collections\/([a-zA-Z0-9_\-]+)(?:\/views\/[a-zA-Z0-9_\-]+)?\/entries\/([a-zA-Z0-9_\-]+)"/gm,
			replacer: captures => `href="/i/${captures[0]}/${captures[1]}"`
		},
		{ // other tags
			regex: /\[([^\[\]]*)\]/gm,
			replacer: _.constant('')
		}
	];

	let endResult = inputText;

	_.forEach(replacingEngines, engine => {
		let matches = matchAllRegex(engine.regex, endResult);

		let lastReplacementEndIndex = 0;
		let engineResult = '';

		_.forEach(matches, match => {
			let valueToReplaceWith = engine.replacer(match.captures);

			engineResult += endResult.substring(lastReplacementEndIndex, match.index);
			engineResult += valueToReplaceWith;
			lastReplacementEndIndex = match.index + match.length;
		});

		engineResult += endResult.substring(lastReplacementEndIndex);

		endResult = engineResult;
	});
	return endResult;
};

const transferEntryField = ({ fieldMapping, entry }) => {
	let inputText = entry[fieldMapping.sourceKey];
	if (_.isNil(inputText)) {
		return null;
	}
	let htmlWithCustomSyntaxReplaced = replaceCustomSyntax(entry, inputText);
	return convertHTMLToMarkdown(htmlWithCustomSyntaxReplaced);
}

const convertEntry = entry => {
	let entryUpdateParams = _.chain(config.mapping)
		.filter({ecName: 'Textfield'})
		.reduce((updateParams, field) => {
			if (_.isNil(field.targetKey)) {
				throw 'The mapping has no targetKey yet. Did you createRequiredFields() ? ';
			}

			try {
				updateParams[field.targetKey] = transferEntryField({ fieldMapping: field, entry});	
			} catch (error) {
				console.error('Could not convert field ' + field.targetName + '!', error);
			}
			
			return updateParams;
		}, {})
		.value();

	return {
		entry: _.pick(entry, ['displayString', 'id', 'listId']),
		updateParams: entryUpdateParams
	}
}

return require('./zenkitApi')(config)
	.then(function apiInitialized (ZenkitApi) {
		console.log('ZenkitApi initialized.');

		return Promise.resolve()
			.then(() => {

				const elementsToCreate = _.chain(config.mapping)
					.filter(field => _.isNil(field.targetName) === false && _.isNil(field.targetKey))
					.map(field => {
						return {
							name: field.targetName,
							elementcategory: _.find(ZenkitApi.ecMap, { name: field.ecName }).id,
							uuid: field.targetUuid,
							businessData: { textType: 'markdown' }
						};
					})
					.compact()
					.value();

				if (_.isEmpty(elementsToCreate)) {
					console.log('Reusing existing elements...');
					return;
				}

				return ZenkitApi
					.createListElements({
						listAllId: config.targetListShortId,
						elements: elementsToCreate
					})
					.then(allListElements => {
						config.mapping = _.map(config.mapping, field => {

							if (_.isNil(_.find(allListElements, {uuid: field.targetUuid}))) {
								return field;
							}

							const targetKey = field.targetUuid + '_' + _.find(ZenkitApi.ecMap, {name: field.ecName}).sortKey; 
							return { ...field, targetKey };
						});
						console.log('Created target elements...');
					})
			})
			.then(() => {

				const targetData = ZenkitApi.getKanbanDataForList({ listShortId: config.targetListShortId });

				// If we have different source and target datasets
				if (_.isNil(config.sourceListShortId) === false || _.isNil(config.sourceDataPath) === false) {

					const loadSourceData = function () {
						if (config.sourceDataPath) {
							console.log(`Source data loaded from ${config.sourceDataPath}\n\n`);
							return Promise.resolve(require(config.sourceDataPath).kanbanData);
						} else {
							return ZenkitApi.getKanbanDataForList({listShortId: config.sourceListShortId})
								.then(kanbanData => {
									console.log('Loaded source data for ' + _.size(kanbanData) + ' items from ' + config.sourceListShortId);
								});
						}
					};

					return Promise.all([loadSourceData(), targetData])
						.then(results => {
							return {
								sourceData: results[0],
								targetData: results[1]
							};
						});
				} else {
					return targetData.then(data => {
						console.log(`Loaded data from list ${config.targetListShortId}...`);
						return {
							sourceData: data,
							targetData: data
						};
					});
				}
			})
			.then(({ sourceData, targetData }) => {

				let convertedEntries = _.compact(_.map(sourceData, convertEntry));
				let entriesToUpdate = convertedEntries.map(({ entry: sourceEntry, updateParams }) => {
					// In the Knowledge Base we can use the displayString to identify items accross collections. They are unique.					
					targetEntryShortId = _.find(targetData, {displayString: sourceEntry.displayString}).shortId;
					return {
						entryShortId: targetEntryShortId,
						updateParams
					};
				});


				console.log(`\n\n${convertedEntries.length} entries converted. Building update actions...`);

				return _.map(entriesToUpdate, entryToUpdate => {
					return () => {
						let action = () => ZenkitApi.updateListEntry({
							listAllId: config.targetListShortId,
							entryAllId: entryToUpdate.entryShortId,
							entryUpdateParams: entryToUpdate.updateParams
						});

						return action()
							.catch(error => {
								if (_.get(error, ['entity', 'error', 'code']) === 'D2') {
									console.error('API quoatas exceeded! Waiting for 1 minute (+ 1 second just to be sure).');
									return new Promise((resolve, reject) => {
										setTimeout(() => {
											console.log('Retrying...');
											resolve(action());
										}, 61 * 1000);
									});
								}
							});
					};	
				});
			})
			.then(actionsToComplete => {

				const totalActions = actionsToComplete.length;

				console.log('Starting upload with max concurrency of ', config.maxConcurrency)
				const promiseProducer = () => {
					if (_.isEmpty(actionsToComplete)) {
						return null;
					} else {
						var completed = totalActions - actionsToComplete.length;
						console.log(`${completed} / ${totalActions} ...`);
						return actionsToComplete.pop()();
					}
				};

				const pool = new promisePool(promiseProducer, config.maxConcurrency);
				return pool.start();				
			});
	})
	.then(() => console.log('Upload finished.'))
	.catch(err => console.error('Something went wrong: ', err));
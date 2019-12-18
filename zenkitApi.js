const rest = require('rest');
const mime = require('rest/interceptor/mime');
const errorCode = require('rest/interceptor/errorCode');
const _ = require('lodash');

const client = rest.wrap(mime, { mime: 'application/json' }).wrap(errorCode);

const ZenkitApi = {};

module.exports = config => {
	ZenkitApi.config = config;

	return ZenkitApi.getElementcategories()
		.then(ecs => {
			ZenkitApi.ecMap = _.keyBy(ecs, 'id');
			return ZenkitApi;
		});
};

const makeRequest = clientConfig => {
	if (_.isString(clientConfig)) {
		clientConfig = {
			path: clientConfig
		};
	}

	clientConfig.headers = {
		'Zenkit-Api-Key': ZenkitApi.config.apiToken
	};

	// console.log(`${clientConfig.method || 'GET'} ${clientConfig.path} with: `, clientConfig.entity || {});
	return client(clientConfig)
		// .then(result => {
		// 	console.log('Result: ', result.entity);
		// 	return result;
		// })
		.then(result => result.entity);
};

ZenkitApi.getElementcategories = () => {
	return makeRequest(`${ZenkitApi.config.baseUrl}/elementcategories`);
};

ZenkitApi.getElementsForList = ({ listShortId }) => {
	return makeRequest({
		method: 'GET',
		path: `${ZenkitApi.config.baseUrl}/lists/${listShortId}/elements`
	});
};

ZenkitApi.getKanbanDataForList = ({ listShortId }) => {
	return ZenkitApi.getElementsForList({ listShortId })
		.then(elements => {
			let validHeaderElements = _.filter(elements, element => {
				return _.includes(['Categories', 'Persons'], ZenkitApi.ecMap[element.elementcategory].name);
			});

			return makeRequest({
				method: 'POST',
				path: `${ZenkitApi.config.baseUrl}/lists/${listShortId}/entries/filter/kanban`,
				entity: { elementIdX: _.head(validHeaderElements).id }
			});
		})
		.then(response => response.kanbanData);
}

ZenkitApi.createListElements = ({ listAllId, elements }) => {
	return makeRequest({
		method: 'POST',
		path: `${ZenkitApi.config.baseUrl}/lists/${listAllId}/elements`,
		entity: elements
	});
};

ZenkitApi.updateListEntry = ({ listAllId, entryAllId, entryUpdateParams }) => {
	return makeRequest({
		method: 'PUT',
		path: `${ZenkitApi.config.baseUrl}/lists/${listAllId}/entries/${entryAllId}`,
		entity: entryUpdateParams
	});
};
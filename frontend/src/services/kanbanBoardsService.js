import api from './api';

export const listBoards = async (all = false) => {
  const { data } = await api.get('/kanban-boards', { params: all ? { all: 1 } : {} });
  return data;
};

export const listTemplates = async () => {
  const { data } = await api.get('/kanban-boards/templates');
  return data;
};

export const createBoard = async (payload) => {
  const { data } = await api.post('/kanban-boards', payload);
  return data;
};

export const updateBoard = async (id, payload) => {
  const { data } = await api.put(`/kanban-boards/${id}`, payload);
  return data;
};

export const deleteBoard = async (id) => {
  await api.delete(`/kanban-boards/${id}`);
};

export const setDefaultBoard = async (id) => {
  const { data } = await api.put(`/kanban-boards/${id}/default`);
  return data;
};
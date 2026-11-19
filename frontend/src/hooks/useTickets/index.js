import { useState, useEffect, useRef } from "react";
import toastError from "../../errors/toastError";
import format from "date-fns/format";
import sub from "date-fns/sub";import api from "../../services/api";

const useTickets = ({
  searchParam,
  tags,
  users,
  pageNumber,
  status,
  date,
  updatedAt,
  showAll,
  queueIds,
  withUnreadMessages,
  whatsappIds,
  statusFilter,
  forceSearch,
  userFilter,
  sortTickets,
  searchOnMessages
}) => {
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [count, setCount] = useState(0);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    setLoading(true);

    // Debounce menor para queries sem busca textual (mais responsivo)
    const debounceMs = searchParam ? 500 : 200;

    const delayDebounceFn = setTimeout(() => {
      const fetchTickets = async () => {
        // Cancelar requisição anterior
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        if (userFilter === undefined || userFilter === null) {
          try {            
            const { data } = await api.get("/tickets", {
              params: {
                searchParam,
                pageNumber,
                tags,
                users,
                status,
                date,
                updatedAt,
                showAll,
                queueIds,
                withUnreadMessages,
                whatsapps: whatsappIds,
                statusFilter,
                sortTickets,
                searchOnMessages
              },
              signal: abortControllerRef.current.signal
            });
            
            setTickets(data.tickets || []);
            setHasMore(data.hasMore);
            setCount(data.count);
            setLoading(false);
          } catch (err) {
            if (err.name === 'AbortError' || err.name === 'CanceledError') return;
            setLoading(false);
            toastError(err);
          }
        } else {
          try {
            const {data} = await api.get("/dashboard/moments", {
              params: {
                status,
                showAll,
                queueIds,
                dateStart: format(sub(new Date(), { days: 30 }), 'yyyy-MM-dd'),
                dateEnd: format(new Date(), 'yyyy-MM-dd'),
                userId: userFilter
              },
              signal: abortControllerRef.current.signal
            });

            const tickets = (data || []).filter(item => item.userId == userFilter);            
            setTickets(tickets);
            setHasMore(null);
            setLoading(false);
          } catch (err) {
            if (err.name === 'AbortError' || err.name === 'CanceledError') return;
            setLoading(false);
            toastError(err);
          }
        }
      };
      fetchTickets();
    }, debounceMs);

    return () => {
      clearTimeout(delayDebounceFn);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [
    searchParam,
    tags,
    users,
    pageNumber,
    status,
    date,
    updatedAt,
    showAll,
    queueIds,
    withUnreadMessages,
    whatsappIds,
    statusFilter,
    forceSearch,
    sortTickets,
    searchOnMessages
  ]);

  return { tickets, loading, hasMore, count };
};

export default useTickets;

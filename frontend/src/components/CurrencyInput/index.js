import React from 'react'
import PropTypes from 'prop-types'
import MaskedInput from 'react-text-mask'
import createNumberMask from 'text-mask-addons/dist/createNumberMask'
import { getCurrencySymbol, getCurrencyInfo, getCompanyCurrency } from '../../helpers/currencyHelper'

const getDefaultMaskOptions = () => {
    const code = getCompanyCurrency();
    const info = getCurrencyInfo(code);
    // Moedas latinas usam . como separador de milhar e , como decimal
    const isLatinFormat = ['pt-BR', 'es-AR', 'es-CL', 'es-CO', 'es-MX', 'es-PE', 'es-UY', 'es-PY', 'es-BO', 'de-DE'].includes(info.locale);
    return {
        prefix: getCurrencySymbol() + ' ',
        suffix: '',
        includeThousandsSeparator: true,
        thousandsSeparatorSymbol: isLatinFormat ? '.' : ',',
        allowDecimal: true,
        decimalSymbol: isLatinFormat ? ',' : '.',
        decimalLimit: 2,
        integerLimit: 7,
        allowNegative: false,
        allowLeadingZeroes: false,
    };
};

const CurrencyInput = ({ maskOptions, ...inputProps }) => {
    const currencyMask = createNumberMask({
        ...getDefaultMaskOptions(),
        ...maskOptions,
    })

    return <MaskedInput mask={currencyMask} {...inputProps} />
}

CurrencyInput.defaultProps = {
    inputMode: 'numeric',
    maskOptions: {},
}

CurrencyInput.propTypes = {
    inputmode: PropTypes.string,
    maskOptions: PropTypes.shape({
        prefix: PropTypes.string,
        suffix: PropTypes.string,
        includeThousandsSeparator: PropTypes.bool,
        thousandsSeparatorSymbol: PropTypes.string,
        allowDecimal: PropTypes.bool,
        decimalSymbol: PropTypes.string,
        decimalLimit: PropTypes.string,
        requireDecimal: PropTypes.bool,
        allowNegative: PropTypes.bool,
        allowLeadingZeroes: PropTypes.bool,
        integerLimit: PropTypes.number,
    }),
}

export default CurrencyInput

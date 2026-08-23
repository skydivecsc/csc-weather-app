import { useState } from 'react';
import { TRIVIA_SITE_LABEL, TRIVIA_SITE_URL } from '../../config';
import './trivia.css'

function TriviaPopup() {
    const [showTrivia, setShowTrivia] = useState(localStorage.getItem('triviaPopup') || 'true')

    const handleTriviaPopup = () => {
        if (showTrivia === 'true') {
            setShowTrivia('false')
            localStorage.setItem('triviaPopup', 'false')
        } else {
            setShowTrivia('true')
            localStorage.setItem('triviaPopup', 'true')
        }
    }

    return (
        <div className={showTrivia === 'true' ? 'trivia-popup' : 'trivia-popup trivia-hidden'}>
            <span id='trivia-title'>Save the trivia game!</span> Play at <a href={TRIVIA_SITE_URL} target='_blank' rel='noreferrer'>{TRIVIA_SITE_LABEL}</a>
            or find the link in the &apos;Detailed&apos; tab.
            If the leaderboard top 10 is not filled by the end of the month the free jump game will be canceled :(
            <button onClick={handleTriviaPopup} id='trivia-dismiss'>Dismiss</button>
        </div>
    )
}


export default TriviaPopup;
